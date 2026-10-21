"""Maps a normalised student profile onto ONE career's taxonomy entry, producing a 0..1 sub-score per factor plus
the evidence behind it (which answers matched). It does no ranking and no weighting.

A factor returns ``score: None`` when it cannot be evaluated (the student skipped it, or the career has no mapping
for it). The engine then excludes that factor and renormalises the weights. Constraints (budget, internet, device,
study time, formats) are deliberately NOT read here: they must never change career fit.
"""

from __future__ import annotations

from typing import Any

from ..util import is_number, seq_sum


def _blend(values: list[float], mean: float, max_w: float) -> float:
    avg = seq_sum(values) / len(values)
    return mean * avg + max_w * max(values)


def selection_affinity(selected_ids: list[str] | None, career_map: dict | None, config: Any) -> dict:
    """Affinity of selected option ids to a career's mapping. Ids the career has no mapping for are unknown, not zero."""
    considered = [i for i in (selected_ids or []) if career_map and is_number(career_map.get(i))]
    if not considered:
        return {"score": None, "considered": [], "matched": []}
    values = [career_map[i] for i in considered]
    sb = config["selectionBlend"]
    return {
        "score": _blend(values, sb["mean"], sb["max"]),
        "considered": considered,
        "matched": [i for i in considered if career_map[i] >= config["matchThreshold"]],
    }


def preparation_level(profile: dict, dimension: str, config: Any) -> int | None:
    """Student's level (0..3) on a preparation dimension, or None if unanswered."""
    if dimension == "math":
        mc = profile.get("mathConfidence")
        return None if mc is None else config["levels"]["mathConfidence"][mc]
    key = profile.get("programmingExperience") if dimension == "programming" else profile.get("scienceBackground")
    return None if key is None else config["levels"]["experience"][key]


def _first_not_none(a: Any, b: Any) -> Any:
    return a if a is not None else b


def _strengths_feature(profile: dict, tax: dict, config: Any) -> dict:
    cur = selection_affinity(profile["currentSkills"], tax.get("strengths"), config)
    dev = selection_affinity(profile["skillsToDevelop"], tax.get("strengths"), config)
    if cur["score"] is not None and dev["score"] is not None:
        sk = config["skillBlend"]
        score = sk["current"] * cur["score"] + sk["develop"] * dev["score"]
    else:
        score = _first_not_none(cur["score"], dev["score"])
    considered = list(dict.fromkeys([*cur["considered"], *dev["considered"]]))
    return {"score": score, "matched": cur["matched"], "matchedToDevelop": dev["matched"], "considered": considered}


def _academic_feature(profile: dict, tax: dict, config: Any) -> dict:
    subjects = selection_affinity(profile["subjects"], tax.get("subjects"), config)
    dims = []
    for dimension in ("math", "programming", "science"):
        have = preparation_level(profile, dimension, config)
        need = (tax.get("prep") or {}).get(dimension)
        if have is None or not is_number(need):
            continue
        note = None
        if dimension == "programming" and tax.get("foundationPath"):
            # Introductory path: usefulness falls as the student already codes. Redundancy, not ability.
            dim_score = config["foundationRedundancy"][profile["programmingExperience"]]
            if dim_score < 1:
                note = "already_covered"
        else:
            fit = 1 if need == 0 else min(1, have / need)
            floor = config["prepGapFloor"]
            dim_score = floor + (1 - floor) * fit  # never below the floor: no absolute barrier
        dims.append({"dimension": dimension, "have": have, "need": need, "score": dim_score,
                     "gap": max(0, need - have), "note": note})
    preparation = {"score": (seq_sum(d["score"] for d in dims) / len(dims)) if dims else None, "dims": dims}

    if subjects["score"] is not None and preparation["score"] is not None:
        ab = config["academicBlend"]
        score = ab["subjects"] * subjects["score"] + ab["preparation"] * preparation["score"]
    else:
        score = _first_not_none(subjects["score"], preparation["score"])
    return {"score": score, "subjects": subjects, "preparation": preparation, "matchedSubjects": subjects["matched"]}


def map_profile_to_career(profile: dict, tax: dict, config: Any) -> dict:
    """Per-factor features for one career: interests, strengths, workStyle, academic, goals."""
    interests = selection_affinity(profile["interests"], tax.get("interests"), config)
    work_style = selection_affinity(profile["workStyles"], tax.get("workStyles"), config)
    goals = selection_affinity(profile["goals"], tax.get("goals"), config)
    keep = lambda a: {"score": a["score"], "matched": a["matched"], "considered": a["considered"]}  # noqa: E731
    return {
        "interests": keep(interests),
        "strengths": _strengths_feature(profile, tax, config),
        "workStyle": keep(work_style),
        "academic": _academic_feature(profile, tax, config),
        "goals": keep(goals),
    }


def answered_factors(profile: dict, config: Any = None) -> dict:
    """Which factors the student's answers can support at all (independent of any career)."""
    prep = (profile.get("mathConfidence") is not None or profile.get("programmingExperience") is not None
            or profile.get("scienceBackground") is not None)
    return {
        "interests": len(profile["interests"]) > 0,
        "strengths": len(profile["currentSkills"]) > 0 or len(profile["skillsToDevelop"]) > 0,
        "workStyle": len(profile["workStyles"]) > 0,
        "academic": len(profile["subjects"]) > 0 or prep,
        "goals": len(profile["goals"]) > 0,
    }
