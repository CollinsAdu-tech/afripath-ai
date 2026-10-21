"""Evidence-based explanations. Every sentence is built from (a) the student's own answers that matched the career
and (b) records in the knowledge base. Nothing here predicts success, calls a path "the one", or judges suitability.
Language is plain and encouraging for secondary and early-university students.
"""

from __future__ import annotations

from typing import Any

from ..util import locale_key
from .options import QUESTIONNAIRE_OPTIONS as O

_LABELS: dict[str, dict[str, str]] = {
    g: {o["id"]: o["label"] for o in O[g]} for g in ("interests", "strengths", "workStyles", "goals", "subjects")
}


def label_of(group: str, id_: str) -> str:
    return _LABELS.get(group, {}).get(id_, id_)


def _item(group: str, id_: str) -> dict:
    return {"id": id_, "label": label_of(group, id_)}


def _lower(s: str) -> str:
    """'Building intelligent systems' -> 'building intelligent systems' (keeps acronyms such as 'ICT')."""
    if len(s) > 1 and s[1] == s[1].upper() and s[1] != s[1].lower():
        return s
    return s[0].lower() + s[1:]


def _list(labels: list[str]) -> str:
    items = [_lower(x) for x in labels]
    if len(items) <= 1:
        return "".join(items)
    return f"{', '.join(items[:-1])} and {items[-1]}"


LEVEL_WORDS = ["not started yet", "a beginner", "comfortable", "strong"]
DIMENSION_LABELS = {"math": "Mathematics", "programming": "Programming", "science": "Science background"}


def describe_matches(scored: dict, profile: dict | None = None) -> dict:
    """Answers that matched this career, as {id,label} items grouped like the questionnaire."""
    f = scored["features"]
    return {
        "interests": [_item("interests", i) for i in f["interests"]["matched"]],
        "strengths": [_item("strengths", i) for i in f["strengths"]["matched"]],
        "skillsToDevelop": [_item("strengths", i) for i in f["strengths"]["matchedToDevelop"]],
        "workStyles": [_item("workStyles", i) for i in f["workStyle"]["matched"]],
        "goals": [_item("goals", i) for i in f["goals"]["matched"]],
        "subjects": [_item("subjects", i) for i in f["academic"]["matchedSubjects"]],
    }


def explain_recommendation(*, career: Any, scored: dict, profile: dict, evidence: dict, close_scores: bool) -> dict:
    """Plain-language reasons. ``reasons[].factor`` lets a UI group or icon them."""
    m = describe_matches(scored, profile)
    reasons: list[dict] = []
    t = career.title

    if m["interests"]:
        reasons.append({"factor": "interests", "text": f"You said you are interested in {_list([x['label'] for x in m['interests']])}, which is central to {t}.", "matched": m["interests"]})
    elif scored["features"]["interests"]["considered"]:
        reasons.append({"factor": "interests", "text": f"Some of your interests connect with parts of {t}, though it is not a central match.", "matched": []})

    if m["strengths"]:
        reasons.append({"factor": "strengths", "text": f"Your strengths in {_list([x['label'] for x in m['strengths']])} are used a lot in this path.", "matched": m["strengths"]})
    if m["skillsToDevelop"]:
        reasons.append({"factor": "strengths", "text": f"You want to develop {_list([x['label'] for x in m['skillsToDevelop']])}, and this path gives plenty of chances to practise.", "matched": m["skillsToDevelop"]})
    if m["workStyles"]:
        reasons.append({"factor": "workStyle", "text": f"You like {_list([x['label'] for x in m['workStyles']])}, which is how much of the work in this path is done.", "matched": m["workStyles"]})
    if m["goals"]:
        reasons.append({"factor": "goals", "text": f"This path supports your goals: {_list([x['label'] for x in m['goals']])}.", "matched": m["goals"]})
    if m["subjects"]:
        reasons.append({"factor": "academic", "text": f"Your background in {_list([x['label'] for x in m['subjects']])} is helpful here.", "matched": m["subjects"]})

    prep = scored["features"]["academic"]["preparation"]
    redundant = next((d for d in prep["dims"] if d["note"] == "already_covered"), None)
    if redundant:
        reasons.append({"factor": "academic", "text": "You already have some programming experience, so you may move quickly through this foundation path or skip ahead to a more advanced one.", "matched": []})
    elif prep["dims"] and all(d["gap"] == 0 for d in prep["dims"]):
        reasons.append({"factor": "academic", "text": "Your current preparation lines up well with where this path starts.", "matched": []})

    strong = sum(1 for r in reasons if r["matched"])
    headline = f"{t} lines up with several of your answers" if strong >= 2 else f"{t} connects with some of your answers"
    summary = " ".join(r["text"] for r in reasons[:2]) or f"{t} is worth a look based on the answers you gave."

    notes: list[str] = []
    if evidence["level"] == "exploratory":
        notes.append("This suggestion is exploratory because you answered only a few questions. Answering more will sharpen it.")
    if close_scores:
        notes.append("Several paths fit your answers similarly, so comparing them side by side may help.")
    notes.append("A short questionnaire cannot tell you what you can or cannot do. Treat this as a starting point for exploring.")
    return {"headline": headline, "summary": summary, "reasons": reasons, "notes": notes}


SKILL_LEVEL_RANK = {"introductory": 0, "beginner": 0, "beginner_to_intermediate": 1, "progressive": 2,
                    "intermediate": 2, "intermediate_to_advanced": 3, "advanced": 4}


def describe_gaps(*, kb: Any, career: Any, tax: dict, taxonomy: dict | None, scored: dict, profile: dict, config: Any) -> dict:
    """Skills, strengths and prerequisites to work on. Built only from KB skill records and the student's own answers."""
    mine = [s for s in kb.skills.values() if s.career_id == career.id and s.name]
    mine.sort(key=lambda s: SKILL_LEVEL_RANK.get(s.level, 1))  # stable: KB order breaks ties
    skills_to_build = [{"skillId": s.id, "name": s.name, "level": s.level, "evidence": s.evidence}
                       for s in mine[: config["limits"]["skillsToBuildFirst"]]]

    # Only when the student told us their current strengths can we say a strength is "not yet listed".
    if profile["currentSkills"]:
        cand = [(i, v) for i, v in tax["strengths"].items() if v >= 0.8 and i not in profile["currentSkills"]]
        cand.sort(key=lambda kv: (-kv[1], locale_key(kv[0])))
        strengths_to_build = [_item("strengths", i) for i, _ in cand]
    else:
        strengths_to_build = []

    prerequisites = []
    for d in scored["features"]["academic"]["preparation"]["dims"]:
        if d["gap"] > 0:
            dl = DIMENSION_LABELS[d["dimension"]]
            prerequisites.append({
                "dimension": d["dimension"],
                "label": dl,
                "yourLevel": LEVEL_WORDS[d["have"]],
                "helpfulLevel": LEVEL_WORDS[d["need"]],
                "message": f"{dl} becomes more important as you go deeper into this path. You are {LEVEL_WORDS[d['have']]} so far, and being {LEVEL_WORDS[d['need']]} would help over time. This is guidance, not a requirement: you can still start at the first stage.",
            })

    # For a complete beginner, point to a real introductory path in the KB (never invented).
    bridge_path = None
    needs_coding = any(p["dimension"] == "programming" for p in prerequisites)
    if needs_coding and profile.get("programmingExperience") == "none":
        bridge_id = next((i for i, t in (taxonomy or {}).items() if t.get("foundationPath") and i in kb.careers), None)
        b = kb.careers[bridge_id] if bridge_id and bridge_id != career.id else None
        if b:
            bridge_path = {"careerId": b.id, "title": b.title, "summary": b.summary,
                           "setupRequirements": b.setup_requirements,
                           "why": "If you have never coded before, this beginner track can be a gentle on-ramp, before or alongside this path."}
    return {"skillsToBuild": skills_to_build, "strengthsToBuild": strengths_to_build,
            "prerequisites": prerequisites, "bridgePath": bridge_path}


def profile_notes(profile: dict, evidence: dict, config: Any) -> list[str]:
    notes: list[str] = []
    if len(profile["interests"]) >= config["broadSelectionInterests"]:
        notes.append("You selected many interests, which leaves little to separate the paths. Try choosing the two or three that excite you most.")
    if evidence["level"] == "exploratory":
        notes.append("Only a few questions were answered, so these results are an early signal. Answer more to sharpen them.")
    return notes


FACTOR_QUESTIONS = {
    "interests": {"fields": ["interests"], "question": "Which topics interest you most?"},
    "strengths": {"fields": ["currentSkills", "skillsToDevelop"], "question": "What are you good at, and what would you like to get better at?"},
    "workStyle": {"fields": ["workStyles"], "question": "How do you like to work?"},
    "academic": {"fields": ["subjects", "mathConfidence", "programmingExperience", "scienceBackground"], "question": "What have you studied, and how confident are you in maths and programming?"},
    "goals": {"fields": ["goals"], "question": "What do you hope to achieve?"},
}
