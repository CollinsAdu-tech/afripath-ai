"""Public entry point of the recommendation engine.

    kb = load_knowledge_base_from_dir("data/kb-v0.7")
    engine = Engine(kb)
    engine.recommend(answers)          -> top career paths with explanations
    engine.roadmap(answers, career_id) -> personalised learning plan

Framework-free and I/O-free: no HTTP, no file access, no clock, no randomness. The same answers and knowledge
base always give the same result. The API layer (pathfinder.api) depends on this module only.

MACHINE-LEARNING UPGRADE POINT
------------------------------
Ordering of careers is delegated to ``ranker``, a callable ``(profile, career_ids, taxonomy, config) -> list[scored]``
where every ``scored`` item has the shape produced by ``scoring.score_career`` (careerId, fitScore 0..100,
applicableWeight, factors[], features{}). To try a learned model, write a ranker that produces the same shape
(for example by blending a model's probability into ``fitScore`` and keeping the factor breakdown for
explanations) and pass ``Engine(kb, ranker=my_ranker)``. Everything downstream (explanations, roadmaps, validation,
the HTTP API) keeps working unchanged.
"""

from __future__ import annotations

from typing import Any, Callable

from ..errors import CareerNotFoundError, InputValidationError, KnowledgeBaseError
from ..knowledge.base import KnowledgeBase
from ..util import is_integer, seq_sum
from .config import CONFIG, ENGINE_VERSION, FACTOR_LABELS, HEURISTIC_NOTE, SCORING_MODEL
from .explain import (FACTOR_QUESTIONS, describe_gaps, describe_matches, explain_recommendation, profile_notes)
from .features import map_profile_to_career
from .options import QUESTIONNAIRE_OPTIONS
from .profile import KNOWN_FIELDS, normalize_profile
from .roadmap import personalize_roadmap, summarize_for_recommendation
from .scoring import assess_evidence, fit_band, rank_careers
from ..util import round1
from .taxonomy import CAREER_TAXONOMY, TAXONOMY_VERSION, validate_taxonomy
from .validate import validate_plan, validate_recommendation_result

Ranker = Callable[[dict, list, dict, Any], list]

__all__ = ["Engine", "create_engine", "InputValidationError", "CareerNotFoundError", "ENGINE_VERSION", "CONFIG",
           "QUESTIONNAIRE_OPTIONS", "CAREER_TAXONOMY", "KNOWN_FIELDS", "validate_plan", "validate_recommendation_result"]


class Engine:
    def __init__(self, kb: KnowledgeBase, config: Any = CONFIG, taxonomy: dict = CAREER_TAXONOMY,
                 ranker: Ranker = rank_careers) -> None:
        if not isinstance(kb, KnowledgeBase):
            raise KnowledgeBaseError("Engine needs a knowledge base built by build_knowledge_base().")
        problems = validate_taxonomy(taxonomy)
        if problems:
            raise KnowledgeBaseError(f"The career taxonomy is invalid: {'; '.join(problems[:3])}")
        weights = list(config["weights"].values())
        if not (seq_sum(weights) > 0) or any(not (w >= 0) for w in weights):
            raise KnowledgeBaseError("Engine weights must be non-negative and sum to more than zero.")

        self.kb = kb
        self.config = config
        self.taxonomy = taxonomy
        self.ranker = ranker
        self.issues: list[dict] = []
        self.scoreable: list[str] = []
        for cid in kb.careers:
            if cid in taxonomy:
                self.scoreable.append(cid)
            else:
                self.issues.append({"severity": "warning", "code": "NO_TAXONOMY", "ref": cid,
                                    "message": f'Career "{cid}" has no taxonomy entry, so it is not scored until one is added.'})
        for cid in taxonomy:
            if cid not in kb.careers:
                self.issues.append({"severity": "warning", "code": "TAXONOMY_UNKNOWN_CAREER", "ref": cid,
                                    "message": f'Taxonomy entry "{cid}" matches no career in the knowledge base.'})
        if not self.scoreable:
            raise KnowledgeBaseError("No career in the knowledge base can be scored: none has a taxonomy entry.", self.issues)

    # ------------------------------------------------------------------ helpers
    def meta(self) -> dict:
        return {"engineVersion": ENGINE_VERSION, "knowledgeBaseVersion": self.kb.version,
                "taxonomyVersion": TAXONOMY_VERSION, "scoringModel": SCORING_MODEL}

    def _weights(self) -> dict:
        return dict(self.config["weights"])

    def _prepare(self, raw_profile: Any) -> tuple[dict, list]:
        r = normalize_profile(raw_profile)
        if r["errors"]:
            raise InputValidationError(r["errors"])
        return r["profile"], r["warnings"]

    def _career_view(self, career_id: str) -> dict:
        c = self.kb.careers[career_id]
        return {"careerId": c.id, "title": c.title, "category": c.category, "summary": c.summary}

    # ------------------------------------------------------------------ public API
    def recommend(self, raw_profile: Any, max_results: Any = None) -> dict:
        cfg = self.config
        kb = self.kb
        default_max = cfg["maxRecommendations"]
        if max_results is None:
            max_results = default_max
        profile, warnings = self._prepare(raw_profile)
        limit = min(max(int(max_results) if is_integer(max_results) else default_max, 1), default_max)
        evidence = assess_evidence(profile, cfg)
        missing_information = [{"factor": f, "label": FACTOR_LABELS[f], **FACTOR_QUESTIONS[f]} for f in evidence["missing"]]
        base = {
            "scoreNote": HEURISTIC_NOTE,
            "evidence": {"level": evidence["level"],
                         "answeredFactors": [f for f, ok in evidence["answered"].items() if ok],
                         "share": round1(evidence["applicableWeightShare"] * 100)},
            "missingInformation": missing_information,
            "warnings": warnings,
            "meta": {**self.meta(), "weights": self._weights()},
        }

        if evidence["level"] == "insufficient":
            return {
                "status": "insufficient_information",
                "message": "We need a little more information before suggesting paths. Answer the questions below, starting with the first. You can skip any you prefer not to answer.",
                "recommendations": [],
                "explore": {"otherCareers": [{**self._career_view(i), "fitScore": None} for i in self.scoreable],
                            "hint": "You can browse every career path while you decide what to answer."},
                "notes": [],
                **base,
            }

        ranked = self.ranker(profile, self.scoreable, self.taxonomy, cfg)
        chosen = [r for r in ranked if r["fitScore"] >= cfg["minMeaningfulScore"]][:limit]
        exploratory_fallback = False
        if not chosen:
            chosen = ranked[:limit]
            exploratory_fallback = True
        exploratory = evidence["level"] == "exploratory" or exploratory_fallback
        spread = chosen[0]["fitScore"] - chosen[-1]["fitScore"] if len(chosen) > 1 else float("inf")
        close_scores = spread < cfg["evidence"]["closeScoreSpread"]

        recommendations = []
        for i, scored in enumerate(chosen):
            career = kb.careers[scored["careerId"]]
            tax = self.taxonomy[scored["careerId"]]
            band = cfg["exploratoryBand"] if exploratory else fit_band(scored["fitScore"], cfg)
            gaps = describe_gaps(kb=kb, career=career, tax=tax, taxonomy=self.taxonomy, scored=scored, profile=profile, config=cfg)
            plan = personalize_roadmap(kb=kb, career_id=career.id, profile=profile, config=cfg, gaps=gaps)
            sl = summarize_for_recommendation(plan, cfg)
            explanation = explain_recommendation(career=career, scored=scored, profile=profile, evidence=evidence, close_scores=close_scores)
            recommendations.append({
                "rank": i + 1,
                **self._career_view(career.id),
                "fit": {
                    "kind": "heuristic_fit_score", "scale": "0-100", "score": round1(scored["fitScore"]),
                    "label": band["label"], "labelId": band["id"],
                    "basis": "limited_answers" if exploratory else "broad_answers",
                    "disclaimer": "Heuristic fit score based only on your answers. Not a prediction of success.",
                },
                "explanation": explanation,
                "matched": describe_matches(scored, profile),
                "factorBreakdown": [{
                    "factor": f["factor"], "label": f["label"],
                    "status": "evaluated" if f["evaluated"] else "not_evaluated",
                    "weightPercent": round1(f["effectiveWeight"] * 100),
                    "score": round1(f["subscore"] * 100) if f["evaluated"] else None,
                    "contributionPoints": round1(f["contribution"]),
                } for f in scored["factors"]],
                "careerBasis": tax["evidence"],
                "skillGaps": {"skillsToBuild": gaps["skillsToBuild"], "strengthsToBuild": gaps["strengthsToBuild"],
                              "prerequisites": gaps["prerequisites"], "bridgePath": gaps["bridgePath"]},
                **sl,
                "roadmapRequest": {"method": "POST", "path": "/v1/roadmaps", "body": {"careerId": career.id}},
            })

        chosen_ids = {c["careerId"] for c in chosen}
        notes = profile_notes(profile, evidence, cfg)
        if exploratory_fallback:
            notes.append("No path stood out strongly, so these are the closest matches for exploring rather than firm suggestions.")
        return {
            "status": "exploratory" if exploratory else "ok",
            "message": ("Here are some paths to explore. Treat them as an early signal, not a firm answer."
                        if exploratory else
                        "Here are paths that line up with your answers. They are starting points for exploring, not a verdict."),
            "recommendations": recommendations,
            "explore": {
                "otherCareers": [{**self._career_view(r["careerId"]), "fitScore": round1(r["fitScore"])}
                                 for r in ranked if r["careerId"] not in chosen_ids],
                "hint": "Want to see other options? Browse these paths, or change your answers and ask again.",
            },
            "notes": notes,
            **base,
        }

    def roadmap(self, raw_profile: Any, career_id: Any) -> dict:
        kb = self.kb
        if not isinstance(career_id, str) or career_id not in kb.careers:
            raise CareerNotFoundError(career_id)
        profile, warnings = self._prepare({} if raw_profile is None else raw_profile)
        career = kb.careers[career_id]
        tax = self.taxonomy.get(career_id)
        gaps = None
        if tax:
            gaps = describe_gaps(kb=kb, career=career, tax=tax, taxonomy=self.taxonomy,
                                 scored={"features": map_profile_to_career(profile, tax, self.config)},
                                 profile=profile, config=self.config)
        plan = personalize_roadmap(kb=kb, career_id=career_id, profile=profile, config=self.config, gaps=gaps)
        return {**plan, "warnings": warnings, "meta": self.meta()}

    def list_careers(self) -> list[dict]:
        return [{**self._career_view(c.id), "stageCount": len(c.stage_ids), "projectCount": len(c.project_ids),
                 "scored": bool(self.taxonomy.get(c.id))} for c in self.kb.careers.values()]

    def get_career(self, career_id: Any) -> dict:
        kb = self.kb
        if not isinstance(career_id, str) or career_id not in kb.careers:
            raise CareerNotFoundError(career_id)
        c = kb.careers[career_id]
        return {
            **self._career_view(c.id), "audiences": c.audiences, "quickStart": c.quick_start,
            "setupRequirements": c.setup_requirements,
            "stages": [{"stageId": s.id, "order": s.order, "name": s.name, "durationPerSource": s.duration_text}
                       for s in (kb.stages[i] for i in c.stage_ids)],
            "projectCount": len(c.project_ids), "skillCount": len(c.skill_ids),
            "opportunityLeadCount": len(c.opportunity_ids),
            "basis": (self.taxonomy.get(c.id) or {}).get("evidence", []),
            "verificationStatus": c.verification_status,
            "meta": self.meta(),
        }

    def options(self) -> dict:
        return {"options": QUESTIONNAIRE_OPTIONS, "factorWeights": self._weights(), "meta": self.meta()}

    def info(self) -> dict:
        return {**self.meta(), "counts": self.kb.counts, "weights": self._weights(),
                "issues": len(self.issues) + len(self.kb.issues)}


def create_engine(kb: KnowledgeBase, **kwargs: Any) -> Engine:
    return Engine(kb, **kwargs)
