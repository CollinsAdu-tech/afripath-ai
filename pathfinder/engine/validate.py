"""Checks a recommendation result or roadmap plan against the knowledge base: valid ids, scores in range, no
duplicate resources, and every link taken from the knowledge base. Used by tests and by the API as a last line of
defence before a response leaves the server.
"""

from __future__ import annotations

from typing import Any

from ..knowledge.base import KnowledgeBase, normalize_url


def _collect_resources(items: list[dict], where: str, kb: KnowledgeBase, problems: list[str],
                       seen_ids: set, seen_urls: set) -> None:
    for r in items:
        rec = kb.resources.get(r["resourceId"])
        if rec is None:
            problems.append(f'{where}: unknown resource "{r["resourceId"]}"')
            continue
        if r.get("url") != rec.url:
            problems.append(f'{where}: link for "{r["resourceId"]}" does not come from the knowledge base')
        if r["resourceId"] in seen_ids:
            problems.append(f'{where}: duplicate resource "{r["resourceId"]}"')
        seen_ids.add(r["resourceId"])
        u = normalize_url(rec.url)
        if u:
            if u in seen_urls:
                problems.append(f'{where}: duplicate URL for "{r["resourceId"]}"')
            seen_urls.add(u)


def validate_plan(plan: dict | None, kb: KnowledgeBase, career_id: str | None = None) -> dict:
    if career_id is None and plan:
        career_id = (plan.get("career") or {}).get("careerId")
    problems: list[str] = []
    if not plan or career_id not in kb.careers:
        return {"valid": False, "problems": [f'unknown career "{career_id}"']}
    career = kb.careers[career_id]
    seen_ids: set = set()
    seen_urls: set = set()
    for s in plan["stages"]:
        rec = kb.stages.get(s["stageId"])
        if rec is None or rec.career_id != career_id:
            problems.append(f'stage "{s["stageId"]}" does not belong to {career_id}')
        _collect_resources(s["resources"], f'stage {s["stageId"]}', kb, problems, seen_ids, seen_urls)
        for a in s["activities"]:
            for r in a["resources"]:
                if r["resourceId"] not in kb.resources:
                    problems.append(f'activity in {s["stageId"]}: unknown resource "{r["resourceId"]}"')
        for c in s["communities"]:
            if c["communityId"] not in kb.communities:
                problems.append(f'stage {s["stageId"]}: unknown community "{c["communityId"]}"')
    plan_ids = {r["resourceId"] for s in plan["stages"] for r in s["resources"]}
    for s in plan["stages"]:
        for a in s["activities"]:
            for r in a["resources"]:
                if r["resourceId"] not in plan_ids:
                    problems.append(f'activity in {s["stageId"]} references "{r["resourceId"]}", which is not in the plan')
    for p in plan["projects"]:
        rec = kb.projects.get(p["projectId"])
        if rec is None or rec.career_id != career_id or rec.quarantined:
            problems.append(f'project "{p["projectId"]}" is not valid for {career_id}')
    for o in plan["opportunityLeads"]:
        if o["opportunityId"] not in career.opportunity_ids:
            problems.append(f'opportunity "{o["opportunityId"]}" is not linked to {career_id}')
        if o["status"] != "unverified_lead":
            problems.append(f'opportunity "{o["opportunityId"]}" must not claim a verified status')
    fa = plan.get("firstAction")
    if fa and fa.get("resource") and fa["resource"]["resourceId"] not in kb.resources:
        problems.append("firstAction references an unknown resource")
    sp = plan.get("startingPoint")
    if sp and not any(s["stageId"] == sp["stageId"] for s in plan["stages"]):
        problems.append("startingPoint is not one of the stages")
    return {"valid": not problems, "problems": problems}


def _in_range(v: Any, hi: float) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and 0 <= v <= hi


def validate_recommendation_result(result: dict, kb: KnowledgeBase) -> dict:
    problems: list[str] = []
    ids: set = set()
    for rec in result.get("recommendations") or []:
        cid = rec["careerId"]
        if cid not in kb.careers:
            problems.append(f'unknown career "{cid}"')
            continue
        if cid in ids:
            problems.append(f'duplicate recommendation for "{cid}"')
        ids.add(cid)
        if not _in_range(rec["fit"]["score"], 100):
            problems.append(f"score out of range for {cid}")
        for f in rec["factorBreakdown"]:
            if not (f["score"] is None or _in_range(f["score"], 100)):
                problems.append(f"factor score out of range for {cid}")
        seen_ids: set = set()
        seen_urls: set = set()
        _collect_resources(rec["startingResources"], f"recommendation {cid}", kb, problems, seen_ids, seen_urls)
        for s in rec["roadmap"]["stages"]:
            st = kb.stages.get(s["stageId"])
            if st is None or st.career_id != cid:
                problems.append(f'stage "{s["stageId"]}" does not belong to {cid}')
        for p in rec["projects"]:
            pr = kb.projects.get(p["projectId"])
            if pr is None or pr.career_id != cid or pr.quarantined:
                problems.append(f'project "{p["projectId"]}" is not valid for {cid}')
        bp = (rec.get("skillGaps") or {}).get("bridgePath")
        if bp and bp["careerId"] not in kb.careers:
            problems.append("bridgePath references an unknown career")
        for s in (rec.get("skillGaps") or {}).get("skillsToBuild") or []:
            if s["skillId"] not in kb.skills:
                problems.append(f'unknown skill "{s["skillId"]}"')
    for o in (result.get("explore") or {}).get("otherCareers") or []:
        if o["careerId"] not in kb.careers:
            problems.append(f'explore lists unknown career "{o["careerId"]}"')
    return {"valid": not problems, "problems": problems}
