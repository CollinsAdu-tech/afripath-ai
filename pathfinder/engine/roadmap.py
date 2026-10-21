"""Builds a personalised learning plan from the REAL roadmap records of the knowledge base.

What personalisation may do:  choose the starting stage, order resources, flag access barriers, suggest pacing,
                              order projects by difficulty, explain gaps.
What it may NOT do:           invent stages, resources, links, durations, deadlines, prices, eligibility or
                              opportunity status; or change a career's fit score.

Constraints (budget, internet, device, study time, formats) only shape THIS output. They never reach the scoring
code, so a student who cannot afford a course can still explore that career.
"""

from __future__ import annotations

import re
from typing import Any

from ..knowledge.base import KnowledgeBase, normalize_url

START_INDEX_BY_EXPERIENCE = {"none": 0, "some": 1, "solid": 2}
BEGINNER_EXPERIENCE = {None, "none", "some"}
DIFFICULTY_RANK_BEGINNER = {"beginner": 0, None: 1, "intermediate": 2}
DIFFICULTY_RANK_EXPERIENCED = {"intermediate": 0, None: 1, "beginner": 2}

FLAG_MESSAGES = {
    "check_cost": "May involve costs, so it is listed after other options in this stage. Check current pricing before you commit.",
    "data_heavy": "Video-based, so it may use a lot of data. It is listed after lighter options; consider using it when your connection is better.",
    "needs_account_setup": "Needs an account or platform setup. Check what it requires before you start.",
    "matches_preferred_format": "Matches a learning format you said you prefer.",
}

_MATH_RE = re.compile(r"\b(math|maths|mathematics|algebra|calculus|statistics)\b", re.IGNORECASE)


def _make_context(profile: dict) -> dict:
    return {
        "lowBudget": profile.get("budget") in ("none", "low"),
        "limitedInternet": profile.get("internet") in ("unreliable", "limited"),
        "limitedDevice": profile.get("device") in ("phone_only", "low_spec_computer"),
        "formats": set(profile.get("learningFormats") or []),
    }


def _ref(r: Any) -> dict:
    return {"resourceId": r.id, "title": r.title or r.id, "url": r.url}


def _resource_view(kb: KnowledgeBase, rid: str, ctx: dict) -> dict:
    r = kb.resources[rid]
    a = r.access
    flags: list[dict] = []

    def add(code: str) -> None:
        flags.append({"code": code, "message": FLAG_MESSAGES[code]})

    if ctx["lowBudget"] and a["cost"] == "may_involve_cost":
        add("check_cost")
    if ctx["limitedInternet"] and a["bandwidth"] == "heavy_by_type":
        add("data_heavy")
    if a["needsAccountSetup"]:
        add("needs_account_setup")
    if ctx["formats"] and any(f in ctx["formats"] for f in a["formats"]):
        add("matches_preferred_format")
    return {
        "resourceId": r.id, "title": r.title or r.id, "provider": r.provider, "type": r.type, "url": r.url,
        "bestFor": r.best_for,
        "access": {"cost": a["cost"], "costNote": a["costNote"],
                   "dataUse": "video_heavy" if a["bandwidth"] == "heavy_by_type" else "not_stated",
                   "needsAccountSetup": a["needsAccountSetup"], "formats": a["formats"]},
        "notes": [n for n in (r.source_note, r.access_note) if n],
        "verificationStatus": r.verification_status,
        "linkStatus": "unverified_link" if r.url else "no_link_provided",
        "flags": flags,
    }


def _order_by_constraints(views: list[dict], ctx: dict) -> list[dict]:
    """Lexicographic priority: affordable first, then lighter on data, then preferred format. Stable on KB order."""
    def key(v: dict) -> tuple:
        return (
            1 if ctx["lowBudget"] and v["access"]["cost"] == "may_involve_cost" else 0,
            1 if ctx["limitedInternet"] and v["access"]["dataUse"] == "video_heavy" else 0,
            1 if ctx["formats"] and not any(f in ctx["formats"] for f in v["access"]["formats"]) else 0,
        )
    return sorted(views, key=key)  # sorted() is stable


def _start_index(profile: dict, career_id: str, stage_count: int) -> int:
    lvl = (profile.get("experienceByCareer") or {}).get(career_id) or "none"
    return min(START_INDEX_BY_EXPERIENCE.get(lvl, 0), max(stage_count - 1, 0))


def _has_math_resources(kb: KnowledgeBase) -> bool:
    for r in kb.resources.values():
        blob = f"{r.title if r.title is not None else 'null'} {r.best_for or ''} {r.source_note or ''}"
        if _MATH_RE.search(blob):
            return True
    return False


def personalize_roadmap(*, kb: KnowledgeBase, career_id: str, profile: dict, config: Any, gaps: dict | None = None) -> dict:
    """``gaps`` (optional) is the output of describe_gaps, reused for prerequisite guidance."""
    career = kb.careers[career_id]
    ctx = _make_context(profile)
    stage_recs = [kb.stages[i] for i in career.stage_ids]
    begin = _start_index(profile, career_id, len(stage_recs))
    knowledge_gaps: list[str] = []

    # ---- stages, with plan-wide de-duplication of resources (by id, then by normalised URL)
    seen_ids: set[str] = set()
    url_owner: dict[str, str] = {}   # normalised url -> canonical resource id
    alias: dict[str, str] = {}       # dropped duplicate id -> canonical id
    stages: list[dict] = []
    for idx, s in enumerate(stage_recs):
        introduced: list[str] = []
        for rid in s.resource_ids:
            r = kb.resources[rid]
            u = normalize_url(r.url)
            if rid in seen_ids:
                continue
            if u and u in url_owner:
                alias[rid] = url_owner[u]
                continue
            seen_ids.add(rid)
            if u:
                url_owner[u] = rid
            introduced.append(rid)
        has_days = any(a.day for a in s.activities)
        views = [_resource_view(kb, rid, ctx) for rid in introduced]
        if not has_days:
            views = _order_by_constraints(views, ctx)  # keep day-by-day order when the source gives one

        activities = [{
            "activityId": a.id, "title": a.title, "type": a.type, "day": a.day, "note": a.note,
            "resources": [_ref(kb.resources[rid]) for rid in dict.fromkeys(alias.get(x) or x for x in a.resource_ids)],
        } for a in s.activities]
        communities = []
        for cid in s.community_ids:
            c = kb.communities[cid]
            communities.append({"communityId": c.id, "name": c.name, "url": c.url, "type": c.type,
                                "verificationStatus": c.verification_status})

        gaps_here: list[str] = []
        if len(s.resource_ids) == 0:
            gaps_here.append("No resources are listed for this stage in the knowledge base yet.")
        if gaps_here:
            knowledge_gaps.append(f"{s.name or s.id}: {gaps_here[0]}")

        stages.append({
            "stageId": s.id, "order": s.order, "name": s.name or s.id,
            "status": "covered_by_your_answers" if idx < begin else "start_here" if idx == begin else "upcoming",
            "durationPerSource": s.duration_text,
            "prerequisitesPerSource": s.prerequisites,
            "focus": s.focus, "actions": s.actions, "weeklyPlanPerSource": s.weekly_plan, "checkpoints": s.checkpoints,
            "activities": activities, "resources": views, "communities": communities, "gaps": gaps_here,
        })

    # ---- starting point and first action
    start = stages[begin] if begin < len(stages) else None
    if start:
        starting_point = {
            "stageId": start["stageId"], "order": start["order"], "name": start["name"],
            "reason": ("Everyone starts at the first stage unless they tell us they have already covered it. Move on whenever you feel ready."
                       if begin == 0 else
                       "You said you already have some experience here, so the plan starts at this stage. The earlier stages stay available if you want to revisit them."),
        }
    else:
        starting_point = None

    first_action = None
    pacing = None
    entries: list[dict] = []
    if start:
        has_days = any(a["day"] for a in start["activities"])
        by_id = {v["resourceId"]: v for v in start["resources"]}
        with_resources = [a for a in start["activities"] if a["resources"]]
        if with_resources:
            source = []
            for a in with_resources:
                r = a["resources"][0]
                v = by_id.get(r["resourceId"]) or _resource_view(kb, r["resourceId"], ctx)
                source.append({"title": a["title"] or r["title"], "activityId": a["activityId"], "resource": r, "flags": v["flags"]})
        else:
            source = [{"title": v["title"], "activityId": None,
                       "resource": {"resourceId": v["resourceId"], "title": v["title"], "url": v["url"]},
                       "flags": v["flags"]} for v in start["resources"]]

        # Day-by-day plans keep the source order; otherwise prefer entries not flagged for cost or data use.
        def rank(e: dict) -> int:
            return (1 if any(f["code"] == "check_cost" for f in e["flags"]) else 0) + \
                   (1 if any(f["code"] == "data_heavy" for f in e["flags"]) else 0)
        entries.extend(source if has_days else sorted(source, key=rank))
        if entries:
            e = entries[0]
            first_action = {
                "text": f"Start with “{e['title']}”.",
                "stageId": start["stageId"], "activityId": e["activityId"], "resource": e["resource"], "flags": e["flags"],
                "why": "It is the first item for the stage you are starting at, after taking your access needs into account.",
            }
        elif start["actions"]:
            first_action = {"text": start["actions"][0], "stageId": start["stageId"], "activityId": None, "resource": None,
                            "flags": [], "why": "The roadmap lists this as the first action for the stage you are starting at."}
        else:
            knowledge_gaps.append(f"{start['name']}: no specific first action or resource is listed in the knowledge base.")
    if profile.get("weeklyHours") is not None and start:
        n = next(p["itemsPerWeek"] for p in config["pacing"] if profile["weeklyHours"] <= p["maxHours"])
        pacing = {
            "weeklyHours": profile["weeklyHours"],
            "suggestedItemsPerWeek": n,
            "firstWeek": [{"title": e["title"], "resource": e["resource"]} for e in entries[:n]],
            "note": "A suggestion for pacing only. Stage durations are shown exactly as written by the sources and are not turned into deadlines.",
        }

    # ---- projects (the knowledge base links projects to careers, not to stages)
    ebc = (profile.get("experienceByCareer") or {}).get(career_id)
    beginner = profile.get("programmingExperience") in BEGINNER_EXPERIENCE and (ebc if ebc is not None else "none") != "solid"
    diff_rank = DIFFICULTY_RANK_BEGINNER if beginner else DIFFICULTY_RANK_EXPERIENCED
    plist = sorted((kb.projects[i] for i in career.project_ids), key=lambda p: diff_rank.get(p.difficulty, 1))
    projects = [{
        "projectId": p.id, "title": p.title or p.id, "description": p.description, "type": p.type,
        "difficulty": p.difficulty or "not_specified", "deliverable": p.deliverable, "safetyNote": p.safety_note,
        "notes": p.notes, "skills": [s["name"] for s in p.skill_refs if s.get("name")],
    } for p in plist]
    if not projects:
        knowledge_gaps.append("No projects are listed for this path in the knowledge base yet.")
    else:
        knowledge_gaps.append("The knowledge base links projects to the whole path, not to individual stages, so projects are not matched to a stage.")
    if career.quarantined_project_ids:
        knowledge_gaps.append(f"{len(career.quarantined_project_ids)} project records are held back until a data review fixes their category.")

    # ---- tracks, opportunities, communities-level guidance
    learning_tracks = []
    for tid in career.track_ids:
        t = kb.learning_tracks[tid]
        learning_tracks.append({
            "trackId": t.id, "title": t.title, "area": t.area, "summary": t.summary, "provider": t.provider,
            "catalog": _ref(kb.resources[t.resource_id]) if t.resource_id else None,
            "note": t.note, "verificationStatus": t.verification_status,
        })
    opportunity_leads = []
    for oid in career.opportunity_ids:
        o = kb.opportunities[oid]
        opportunity_leads.append({
            "opportunityId": o.id, "title": o.title, "type": o.type, "url": o.url, "eligibility": o.eligibility,
            "notes": o.notes, "status": "unverified_lead",
            "statusNote": "Unverified lead. Do not assume it is open or funded. Check the official page for current dates, eligibility and costs.",
            "verificationStatus": o.verification_status,
        })
    guidance = [{"text": a["text"], "type": a["type"]}
                for a in (kb.advice.get(career_id) or [])[: config["limits"]["guidanceTips"]]]

    # ---- access considerations (derived only from KB flags and the student's own constraints)
    all_views = [v for s in stages for v in s["resources"]]
    access: list[dict] = []
    costly = [v for v in all_views if v["access"]["cost"] == "may_involve_cost"]
    if ctx["lowBudget"] and costly:
        access.append({
            "code": "cost_may_apply",
            "message": f"{len(costly)} resources in this roadmap may involve costs. Within each stage they are listed after other options. Prices are not verified in the knowledge base, so compare before paying for anything, and consider practising with the other resources first.",
            "resourceIds": [v["resourceId"] for v in costly],
        })
    heavy = [v for v in all_views if v["access"]["dataUse"] == "video_heavy"]
    if ctx["limitedInternet"] and heavy:
        access.append({
            "code": "data_use",
            "message": f"{len(heavy)} resources are video-based and may use a lot of data. Lighter resources are listed first within each stage.",
            "resourceIds": [v["resourceId"] for v in heavy],
        })
    accounts = [v for v in all_views if v["access"]["needsAccountSetup"]]
    if accounts and (ctx["lowBudget"] or ctx["limitedDevice"]):
        access.append({
            "code": "account_setup",
            "message": f"{len(accounts)} resources are platforms or cloud services that need an account or setup. Check their requirements and any charges before starting.",
            "resourceIds": [v["resourceId"] for v in accounts],
        })
    if ctx["limitedDevice"]:
        access.append({
            "code": "device",
            "message": (f"For this path the source says: {career.setup_requirements}."
                        if career.setup_requirements else
                        "The knowledge base does not state device requirements for this path. Check each resource before you start, especially tools you install or run locally."),
        })

    # ---- prerequisite guidance
    prereq = ({"prerequisites": gaps["prerequisites"], "bridgePath": gaps["bridgePath"]} if gaps
              else {"prerequisites": [], "bridgePath": None})
    if any(p["dimension"] == "math" for p in prereq["prerequisites"]) and not _has_math_resources(kb):
        knowledge_gaps.append("This path uses mathematics, but the current knowledge base contains no maths-specific resources. Ask a teacher or look for a maths course separately.")

    return {
        "career": {"careerId": career.id, "title": career.title, "category": career.category, "summary": career.summary},
        "startingPoint": starting_point, "firstAction": first_action, "pacing": pacing, "stages": stages,
        "prerequisiteGuidance": prereq, "projects": projects, "learningTracks": learning_tracks,
        "opportunityLeads": opportunity_leads, "guidance": guidance, "accessConsiderations": access,
        "knowledgeGaps": knowledge_gaps,
        "caveats": [
            "Links, course availability, prices and opportunities come from a knowledge base that has not been independently verified. Check each one before relying on it.",
            "Stage durations are shown as written by the sources. They are not promises or deadlines.",
        ],
    }


def summarize_for_recommendation(plan: dict, config: Any) -> dict:
    """Compact slice of a plan used inside a recommendation."""
    start = next((s for s in plan["stages"] if s["status"] == "start_here"), None)
    return {
        "roadmap": {
            "startingPoint": plan["startingPoint"],
            "stages": [{"stageId": s["stageId"], "order": s["order"], "name": s["name"], "status": s["status"],
                        "durationPerSource": s["durationPerSource"]} for s in plan["stages"]],
        },
        "firstStep": plan["firstAction"],
        "startingResources": start["resources"][: config["limits"]["startingResources"]] if start else [],
        "projects": plan["projects"][: config["limits"]["projectsPerRecommendation"]],
        "accessConsiderations": plan["accessConsiderations"],
        "knowledgeGaps": plan["knowledgeGaps"],
    }
