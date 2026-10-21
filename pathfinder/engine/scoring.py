"""Deterministic, explainable career scoring. Pure functions: no I/O, no randomness, no clock.

    fit_score(career) = 100 * sum(weight_f * subscore_f) / sum(weight_f)     over EVALUABLE factors f

A factor is evaluable only if the student answered it AND the career has a mapping for it. Skipped factors are
excluded and the remaining weights are renormalised, so "I didn't answer" is never read as "no interest" or
"no ability". Popularity and the number of resources in the knowledge base play NO part in scoring.

ML UPGRADE POINT: ``rank_careers`` is the single function the Engine calls to order careers. A learned model can
replace it as long as it returns the same list shape (see Engine(ranker=...) in core.py).
"""

from __future__ import annotations

from typing import Any

from ..util import js_round, locale_key, seq_sum
from .config import FACTOR_LABELS
from .features import answered_factors, map_profile_to_career

FACTORS = list(FACTOR_LABELS.keys())  # interests, strengths, workStyle, academic, goals


def assess_evidence(profile: dict, config: Any) -> dict:
    """How much the student's answers can support meaningful matching."""
    answered = answered_factors(profile, config)
    w = config["weights"]
    total = seq_sum(w[f] for f in FACTORS)
    share = seq_sum(w[f] for f in FACTORS if answered[f]) / total
    has_core = answered["interests"] or answered["strengths"]
    e = config["evidence"]
    level = "sufficient"
    if share < e["minApplicableWeight"] or (not has_core and share < e["minWeightWithoutCore"]):
        level = "insufficient"
    elif share < e["exploratoryBelowWeight"]:
        level = "exploratory"
    # Missing factors, most influential first, so a UI can ask the highest-value question first.
    missing = sorted((f for f in FACTORS if not answered[f]), key=lambda f: -w[f])
    return {"level": level, "applicableWeightShare": share, "answered": answered, "missing": missing}


def score_career(profile: dict, career_id: str, taxonomy_entry: dict, config: Any) -> dict:
    features = map_profile_to_career(profile, taxonomy_entry, config)
    w = config["weights"]
    evaluated = [f for f in FACTORS if features[f]["score"] is not None]
    applicable = seq_sum(w[f] for f in evaluated)

    factors = []
    for f in FACTORS:
        ok = features[f]["score"] is not None and applicable > 0
        eff = w[f] / applicable if ok else 0
        sub = features[f]["score"] if ok else None
        factors.append({
            "factor": f,
            "label": FACTOR_LABELS[f],
            "evaluated": ok,
            "nominalWeight": w[f],
            "effectiveWeight": eff,   # after renormalisation; effective weights of evaluated factors sum to 1
            "subscore": sub,          # 0..1
            "contribution": 100 * eff * sub if ok else 0,  # points out of 100; contributions sum to fitScore
        })
    fit = seq_sum(x["contribution"] for x in factors)
    return {"careerId": career_id, "fitScore": min(100, max(0, fit)), "applicableWeight": applicable,
            "factors": factors, "features": features}


def rank_careers(profile: dict, career_ids: list[str], taxonomy: dict, config: Any) -> list[dict]:
    """Score and rank every career that has a taxonomy entry.

    Ties (to 6 decimals) are broken by career id so identical inputs always give identical rankings.
    """
    scored = [score_career(profile, cid, taxonomy[cid], config) for cid in career_ids if cid in taxonomy]
    return sorted(scored, key=lambda s: (-js_round(s["fitScore"] * 1e6), locale_key(s["careerId"])))


def fit_band(score: float, config: Any) -> Any:
    for b in config["fitBands"]:
        if score >= b["min"]:
            return b
    return config["fitBands"][-1]
