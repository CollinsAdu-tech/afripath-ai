"""Knowledge-base normalisation and validation (pure: no file or network access).

Input : the raw ``combined_*.json`` collections of the Kareer Pathfinder v0.7 archive.
Output: ONE internal, consistent shape plus a list of data-quality ``issues``.

The raw records have different shapes per career (verified by audit of the archive), e.g.
  stage name:      ``name`` | ``title``;   stage order: ``level`` | ``stage_order``
  stage resources: ``learning_activities[].resource_id|resource_ids`` | ``recommended_resource_ids`` | ``resource_ids``
  stage summary:   ``focus`` | ``goal``;   stage checkpoints: ``checkpoints`` | ``checkpoint``
  career title:    ``title`` | ``career_title``

RULES: never invent values. Missing optional fields become None / []. Every irregularity is recorded in
``kb.issues`` instead of being silently "fixed". This module knows nothing about students, scoring or HTTP.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from ..errors import KnowledgeBaseError
from ..util import arr, is_finite, is_obj, locale_key, text, text_list

SUPPORTED_KB_VERSION = "0.7"

COLLECTIONS = ["careers", "roadmap_stages", "resources", "skills", "projects", "communities", "opportunities"]

# ---------------------------------------------------------------------------
# Resource access classification. Only what the record itself supports; "unknown" otherwise.
# Every resource in v0.7 is `not_independently_verified`, so nothing is ever called plainly "free".
# ---------------------------------------------------------------------------
CERT_TYPES = {"certification", "certification_provider", "professional_certificate", "certification_path",
              "training_and_certification_path", "cloud_account_and_pricing"}
VIDEO_TYPES = {"video", "video_channel", "video_playlist", "video_course", "interactive_video_course"}
ACCOUNT_TYPES = {"cloud_service", "cloud_account_and_pricing", "database_platform", "database_and_backend_platform",
                 "deployment_platform", "security_service"}

# Resource type -> learning format, used ONLY to order resources for a student's preferred format.
# Editorial table; types not listed have no format claim ("unknown"), never a guess.
FORMAT_BY_TYPE: dict[str, list[str]] = {
    "video": ["video"], "video_channel": ["video"], "video_playlist": ["video"], "video_course": ["video"],
    "interactive_video_course": ["video", "interactive"],
    "interactive_course": ["interactive"], "interactive_tutorial": ["interactive"], "interactive_text": ["interactive"],
    "interactive_experience": ["interactive"], "coding_exercises": ["interactive"], "gamified_learning": ["interactive"],
    "browser_coding_tool": ["interactive"],
    "practice_lab": ["hands_on"], "hands_on_lab": ["hands_on"], "applied_lab": ["hands_on"], "practice_platform": ["hands_on"],
    "guided_projects": ["hands_on"], "project_challenge": ["hands_on"], "challenge_event": ["hands_on"],
    "hackathon_platform": ["hands_on"], "competition_platform": ["hands_on"],
    "documentation": ["text"], "documentation_and_learning": ["text"], "tutorial": ["text"], "learning_articles": ["text"],
    "reference": ["text"], "publishing_guide": ["text"], "career_guide": ["text"], "newsletter": ["text"],
    "community": ["community"], "community_chat": ["community"], "community_event": ["community"],
    "community_program": ["community"], "community_and_events": ["community"], "learning_community": ["community"],
    "programming_community": ["community"], "research_community": ["community"], "professional_community": ["community"],
    "professional_network": ["community"], "events_and_opportunities": ["community"], "event_and_training": ["community"],
    "conference": ["community"],
}

COST_NOTES = {
    "may_involve_cost": "The knowledge base notes this may involve costs or fees. Check current pricing before you start.",
    "source_mentions_free": "The source describes free access, but this has not been independently verified. Check current terms before you start.",
    "unknown": "The knowledge base does not state the cost. Check before you start.",
}

_COST_WORDS = re.compile(r"(incur|charges|pricing|\bfee|exam cost|paid|payment|subscription)")
_FREE_WORDS = re.compile(r"(\bfree\b|no cost)")


def classify_resource(r: "Resource") -> dict[str, Any]:
    """Derive access hints for a resource. ``cost`` is one of may_involve_cost | source_mentions_free | unknown."""
    note = f"{r.source_note or ''} {r.access_note or ''}".lower()
    cost = "unknown"
    if r.type in CERT_TYPES or _COST_WORDS.search(note):
        cost = "may_involve_cost"
    elif _FREE_WORDS.search(note):
        cost = "source_mentions_free"
    return {
        "cost": cost,
        "costNote": COST_NOTES[cost],
        "bandwidth": "heavy_by_type" if r.type in VIDEO_TYPES else "unknown",
        "needsAccountSetup": r.type in ACCOUNT_TYPES,
        "formats": FORMAT_BY_TYPE.get(r.type or "", []),
    }


def normalize_url(u: str | None) -> str | None:
    return re.sub(r"/+$", "", u.strip().lower()) if u else None


# ----------------------------------------------------------------------------- record types
@dataclass
class Resource:
    id: str
    title: str | None
    provider: str | None
    url: str | None
    type: str | None
    source_note: str | None
    access_note: str | None
    best_for: str | None
    verification_status: str
    access: dict[str, Any] = field(default_factory=dict)


@dataclass
class Career:
    id: str
    title: str
    category: str | None
    summary: str | None
    audiences: list[str]
    quick_start: list[str]
    usage_advice: list[str]
    source_id: str | None
    core_skill_ids: list[str]
    track_ids: list[str]
    weekly_time_commitment: str | None
    setup_requirements: str | None
    verification_status: str
    stage_ids: list[str] = field(default_factory=list)
    project_ids: list[str] = field(default_factory=list)
    skill_ids: list[str] = field(default_factory=list)
    opportunity_ids: list[str] = field(default_factory=list)
    quarantined_project_ids: list[str] = field(default_factory=list)
    declared_project_ids: list[str] = field(default_factory=list)


@dataclass
class Activity:
    id: str | None
    title: str | None
    type: str | None
    day: str | None
    note: str | None
    resource_ids: list[str]


@dataclass
class Stage:
    id: str
    career_id: str
    order: int | float | None
    name: str | None
    duration_text: str | None
    prerequisites: list[str]
    focus: str | None
    actions: list[str]
    weekly_plan: list[dict[str, Any]]
    checkpoints: list[str]
    activities: list[Activity]
    resource_ids: list[str]
    community_ids: list[str]


@dataclass
class Community:
    id: str
    name: str | None
    url: str | None
    resource_id: str | None
    type: str | None
    verification_status: str


@dataclass
class Skill:
    id: str
    name: str | None
    level: str | None
    description: str | None
    evidence: str | None
    career_id: str | None
    linked_by: str | None


@dataclass
class Project:
    id: str
    title: str | None
    description: str | None
    type: str | None
    difficulty: str | None
    deliverable: str | None
    safety_note: str | None
    notes: list[str]
    skill_refs: list[dict[str, Any]]
    source_id: str | None
    career_id: str | None
    linked_by: str | None
    quarantined: bool


@dataclass
class Opportunity:
    id: str
    title: str | None
    type: str | None
    url: str | None
    eligibility: str | None
    notes: str | None
    resource_id: str | None
    career_id: str | None
    status: str
    verification_status: str


@dataclass
class LearningTrack:
    id: str
    title: str | None
    area: str | None
    summary: str | None
    provider: str | None
    resource_id: str | None
    note: str | None
    verification_status: str


@dataclass
class KnowledgeBase:
    version: str
    careers: dict[str, Career]
    stages: dict[str, Stage]
    resources: dict[str, Resource]
    skills: dict[str, Skill]
    projects: dict[str, Project]
    communities: dict[str, Community]
    opportunities: dict[str, Opportunity]
    learning_tracks: dict[str, LearningTrack]
    advice: dict[str, list[dict[str, str]]]
    issues: list[dict[str, Any]]
    counts: dict[str, int]


def build_knowledge_base(raw: Any, version: str = SUPPORTED_KB_VERSION) -> KnowledgeBase:
    """Build the normalised knowledge base from raw collections.

    Raises:
        KnowledgeBaseError: when the data is missing, empty or structurally unusable.
    """
    issues: list[dict[str, Any]] = []

    def issue(severity: str, code: str, message: str, ref: str | None = None) -> None:
        entry = {"severity": severity, "code": code, "message": message}
        if ref:
            entry["ref"] = ref
        issues.append(entry)

    if not is_obj(raw):
        raise KnowledgeBaseError("Knowledge base data is missing or is not an object.")
    for c in COLLECTIONS:
        if not isinstance(raw.get(c), list):
            raise KnowledgeBaseError(f'Knowledge base is invalid: "{c}" must be a list.',
                                     [{"severity": "error", "code": "KB_NOT_LIST", "message": c}])
    if len(raw["careers"]) == 0:
        raise KnowledgeBaseError("Knowledge base is empty: no career records were found.",
                                 [{"severity": "error", "code": "KB_EMPTY", "message": "careers is empty"}])

    def dedupe(records: list, id_field: str, label: str) -> dict[str, dict]:
        seen: dict[str, dict] = {}
        for rec in records:
            rid = text(rec.get(id_field)) if is_obj(rec) else None
            if not rid:
                issue("warning", "MISSING_ID", f"A {label} record has no {id_field}; skipped.")
                continue
            if rid in seen:
                issue("warning", "DUPLICATE_ID", f'Duplicate {label} id "{rid}"; kept the first.', rid)
                continue
            seen[rid] = rec
        return seen

    # ---- resources
    resources: dict[str, Resource] = {}
    for rid, r in dedupe(raw["resources"], "resource_id", "resource").items():
        rec = Resource(
            id=rid, title=text(r.get("title")), provider=text(r.get("provider")), url=text(r.get("url")),
            type=text(r.get("resource_type")), source_note=text(r.get("source_note")), access_note=text(r.get("access_note")),
            best_for=text(r.get("best_for")), verification_status=text(r.get("verification_status")) or "unverified",
        )
        if not rec.title:
            issue("warning", "RESOURCE_NO_TITLE", f'Resource "{rid}" has no title.', rid)
        if not rec.url:
            issue("info", "RESOURCE_NO_URL", f'Resource "{rid}" has no URL; it is shown without a link.', rid)
        rec.access = classify_resource(rec)
        resources[rid] = rec

    # ---- careers
    careers: dict[str, Career] = {}
    career_by_source: dict[str, str] = {}
    for cid, c in dedupe(raw["careers"], "career_id", "career").items():
        audiences = text_list(c.get("intended_audiences")) or text_list(c.get("audience"))
        rec = Career(
            id=cid, title=text(c.get("title")) or text(c.get("career_title")) or "", category=text(c.get("category")),
            summary=text(c.get("summary")), audiences=audiences, quick_start=text_list(c.get("source_quick_start")),
            usage_advice=text_list(c.get("roadmap_usage_advice")), source_id=text(c.get("source_id")),
            core_skill_ids=text_list(c.get("core_skill_ids")), track_ids=text_list(c.get("learning_track_ids")),
            weekly_time_commitment=text(c.get("weekly_time_commitment")), setup_requirements=text(c.get("setup_requirements")),
            verification_status=text(c.get("verification_status")) or "unverified",
            declared_project_ids=text_list(c.get("project_ids")),
        )
        if not rec.title:
            issue("error", "CAREER_NO_TITLE", f'Career "{cid}" has no title; excluded.', cid)
            continue
        if rec.source_id:
            career_by_source[rec.source_id] = cid
        careers[cid] = rec
    if not careers:
        raise KnowledgeBaseError("Knowledge base has no usable career records.", issues)

    # ---- roadmap stages
    stages: dict[str, Stage] = {}
    for sid, s in dedupe(raw["roadmap_stages"], "stage_id", "roadmap stage").items():
        if s.get("career_id") not in careers:
            issue("error", "STAGE_UNKNOWN_CAREER", f'Stage "{sid}" references unknown career "{s.get("career_id")}"; excluded.', sid)
            continue
        activities: list[Activity] = []
        resource_ids: list[str] = []

        def add_res(rid: Any) -> None:
            if isinstance(rid, str) and rid and rid not in resource_ids:
                resource_ids.append(rid)

        for a in arr(s.get("learning_activities")):
            if not is_obj(a):
                continue
            rids = [x for x in [a.get("resource_id"), *arr(a.get("resource_ids"))] if isinstance(x, str) and x]
            activities.append(Activity(id=text(a.get("activity_id")), title=text(a.get("title")), type=text(a.get("activity_type")),
                                       day=text(a.get("day")), note=text(a.get("source_note")), resource_ids=rids))
            if not rids:
                issue("info", "ACTIVITY_NO_RESOURCE",
                      f'Activity "{a.get("activity_id")}" in stage "{sid}" has no resource (a milestone or networking activity).', sid)
            for x in rids:
                add_res(x)
        for x in arr(s.get("recommended_resource_ids")):
            add_res(x)
        for x in arr(s.get("resource_ids")):
            add_res(x)
        for rid in [x for x in resource_ids if x not in resources]:
            issue("error", "DANGLING_RESOURCE_REF", f'Stage "{sid}" references missing resource "{rid}"; reference dropped.', sid)
        for a in activities:
            a.resource_ids = [x for x in a.resource_ids if x in resources]

        order = s.get("level") if is_finite(s.get("level")) else (s.get("stage_order") if is_finite(s.get("stage_order")) else None)
        checkpoints = text_list(s.get("checkpoints")) or text_list(s.get("checkpoint") if isinstance(s.get("checkpoint"), list) else [s.get("checkpoint")])
        weekly = []
        for w in arr(s.get("weekly_plan")):
            if not is_obj(w):
                continue
            weeks_raw = w.get("weeks")
            weekly.append({"weeks": text("" if weeks_raw is None else _js_string(weeks_raw)), "goal": text(w.get("goal")),
                           "actions": text_list(w.get("actions"))})
        stages[sid] = Stage(
            id=sid, career_id=s["career_id"], order=order, name=text(s.get("name")) or text(s.get("title")),
            duration_text=text(s.get("duration_text")) or text(s.get("source_duration")),
            prerequisites=text_list(s.get("prerequisites")), focus=text(s.get("focus")) or text(s.get("goal")),
            actions=text_list(s.get("actions")), weekly_plan=weekly, checkpoints=checkpoints, activities=activities,
            resource_ids=[x for x in resource_ids if x in resources], community_ids=text_list(s.get("community_ids")),
        )
        if not text(s.get("name")) and not text(s.get("title")):
            issue("warning", "STAGE_NO_NAME", f'Stage "{sid}" has no name.', sid)
    for cid, c in careers.items():
        own = sorted((s for s in stages.values() if s.career_id == cid),
                     key=lambda s: (s.order if s.order is not None else 99, locale_key(s.id)))
        c.stage_ids = [s.id for s in own]
        if not own:
            issue("warning", "CAREER_NO_STAGES", f'Career "{cid}" has no roadmap stages.', cid)

    # ---- communities
    communities: dict[str, Community] = {}
    for mid, m in dedupe(raw["communities"], "community_id", "community").items():
        communities[mid] = Community(
            id=mid, name=text(m.get("name")), url=text(m.get("url")),
            resource_id=m.get("resource_id") if m.get("resource_id") in resources else None,
            type=text(m.get("category")) or text(m.get("community_type")),
            verification_status=text(m.get("verification_status")) or "unverified",
        )
    for s in stages.values():
        for x in [x for x in s.community_ids if x not in communities]:
            issue("warning", "DANGLING_COMMUNITY_REF", f'Stage "{s.id}" references missing community "{x}"; dropped.', s.id)
        s.community_ids = [x for x in s.community_ids if x in communities]

    # ---- skills (linked to a career via core_skill_ids, else via the shared source_id)
    skills: dict[str, Skill] = {}
    for kid, k in dedupe(raw["skills"], "skill_id", "skill").items():
        career_id = next((c.id for c in careers.values() if kid in c.core_skill_ids), None)
        linked_by = "career.core_skill_ids" if career_id else None
        if not career_id and k.get("source_id") in career_by_source:
            career_id = career_by_source[k.get("source_id")]
            linked_by = "source_id"
        if not career_id:
            issue("info", "SKILL_UNLINKED", f'Skill "{kid}" could not be linked to a career.', kid)
        skills[kid] = Skill(id=kid, name=text(k.get("name")), level=text(k.get("level")), description=text(k.get("description")),
                            evidence=text(k.get("evidence")), career_id=career_id, linked_by=linked_by)

    # ---- projects
    projects: dict[str, Project] = {}
    for pid, p in dedupe(raw["projects"], "project_id", "project").items():
        career_id = None
        linked_by = None
        quarantined = False
        if p.get("career_id") and p.get("career_id") in careers:
            career_id, linked_by = p["career_id"], "project.career_id"
        else:
            owner = next((c for c in careers.values() if pid in c.declared_project_ids), None)
            if owner:
                career_id, linked_by = owner.id, "career.project_ids"
            elif p.get("source_fit") == "review_required_category_mismatch":
                # The archive itself flags these as attached to the wrong category. We do not guess a new
                # category: they are held back until the data is corrected.
                quarantined = True
                issue("warning", "PROJECT_CATEGORY_MISMATCH",
                      f'Project "{pid}" is flagged "review_required_category_mismatch" (source {p.get("source_id")}); '
                      "it is not attached to any career until the data is corrected.", pid)
            elif p.get("source_id") in career_by_source:
                career_id, linked_by = career_by_source[p["source_id"]], "source_id"
        if not career_id and not quarantined:
            issue("info", "PROJECT_UNLINKED", f'Project "{pid}" could not be linked to a career.', pid)
        raw_skills = text_list(p.get("skills"))
        difficulty = text(p.get("difficulty")) if p.get("difficulty") and p.get("difficulty") != "not_specified" else None
        notes_raw = p.get("notes")
        projects[pid] = Project(
            id=pid, title=text(p.get("title")), description=text(p.get("description")), type=text(p.get("project_type")),
            difficulty=difficulty, deliverable=text(p.get("expected_deliverable")), safety_note=text(p.get("safety_note")),
            notes=text_list(notes_raw if isinstance(notes_raw, list) else [notes_raw]),
            # Older projects reference skill ids; newer ones use plain skill names. Keep what the record says.
            skill_refs=[({"id": x, "name": skills[x].name} if x in skills else {"id": None, "name": x}) for x in raw_skills],
            source_id=text(p.get("source_id")), career_id=career_id, linked_by=linked_by, quarantined=quarantined,
        )
        if not text(p.get("title")):
            issue("warning", "PROJECT_NO_TITLE", f'Project "{pid}" has no title.', pid)
    unresolved = sum(1 for p in projects.values() if any(x["id"] is None for x in p.skill_refs))
    if unresolved:
        issue("info", "PROJECT_SKILLS_BY_NAME",
              f"{unresolved} projects list skills by plain name rather than skill_id; shown as text, not linked to skill records.")

    # ---- opportunities (leads only; no application status or deadline exists in the data)
    opportunities: dict[str, Opportunity] = {}
    for oid, o in dedupe(raw["opportunities"], "opportunity_id", "opportunity").items():
        opportunities[oid] = Opportunity(
            id=oid, title=text(o.get("title")), type=text(o.get("opportunity_type")), url=text(o.get("url")),
            eligibility=text(o.get("eligibility")) or text(o.get("eligibility_note")), notes=text(o.get("notes")),
            resource_id=o.get("resource_id") if o.get("resource_id") in resources else None,
            career_id=career_by_source.get(o.get("source_id")),
            status="unverified_lead",  # NEVER assumed open; the dataset has no verified dates
            verification_status=text(o.get("verification_status")) or "unverified",
        )

    # ---- learning tracks (Data Careers)
    learning_tracks: dict[str, LearningTrack] = {}
    for tid, t in dedupe(arr(raw.get("learning_tracks")), "track_id", "learning track").items():
        learning_tracks[tid] = LearningTrack(
            id=tid, title=text(t.get("title")), area=text(t.get("track_area")), summary=text(t.get("summary")),
            provider=text(t.get("provider")), resource_id=t.get("catalog_resource_id") if t.get("catalog_resource_id") in resources else None,
            note=text(t.get("note")), verification_status=text(t.get("verification_status")) or "unverified",
        )

    # ---- advice (shape differs by career: a list of {advice_id,text} or an object of string lists)
    advice: dict[str, list[dict[str, str]]] = {}
    if is_obj(raw.get("advice")):
        for key, val in raw["advice"].items():
            cid = f"career_{key}" if f"career_{key}" in careers else None
            if not cid:
                issue("info", "ADVICE_UNLINKED", f'Advice group "{key}" does not match a career id; ignored.', key)
                continue
            items: list[dict[str, str]] = []
            if isinstance(val, list):
                for a in val:
                    if is_obj(a) and text(a.get("text")):
                        items.append({"text": text(a.get("text")), "type": text(a.get("advice_type")) or "guidance"})
            elif is_obj(val):
                for typ, lst in val.items():
                    if isinstance(lst, list):
                        for t in lst:
                            if text(t):
                                items.append({"text": text(t), "type": typ})
            advice[cid] = items

    # ---- link children to careers
    for p in projects.values():
        if p.quarantined:
            owner = career_by_source.get(p.source_id)
            if owner:
                careers[owner].quarantined_project_ids.append(p.id)
        elif p.career_id:
            careers[p.career_id].project_ids.append(p.id)
    for k in skills.values():
        if k.career_id:
            careers[k.career_id].skill_ids.append(k.id)
    for o in opportunities.values():
        if o.career_id:
            careers[o.career_id].opportunity_ids.append(o.id)
    for c in careers.values():
        for t in [t for t in c.track_ids if t not in learning_tracks]:
            issue("warning", "DANGLING_TRACK_REF", f'Career "{c.id}" references missing learning track "{t}"; dropped.', c.id)
        c.track_ids = [t for t in c.track_ids if t in learning_tracks]

    # ---- informational reports
    by_url: dict[str, list[str]] = {}
    for r in resources.values():
        u = normalize_url(r.url)
        if u:
            by_url.setdefault(u, []).append(r.id)
    for u, ids in by_url.items():
        if len(ids) > 1:
            issue("info", "DUPLICATE_URL", f"Resources {', '.join(ids)} share the URL {u}; recommendations de-duplicate by URL.")
    used = {rid for s in stages.values() for rid in s.resource_ids}
    orphans = [rid for rid in resources if rid not in used]
    if orphans:
        issue("info", "RESOURCES_NOT_IN_ANY_STAGE",
              f"{len(orphans)} resources are not referenced by any roadmap stage and are therefore never recommended: {', '.join(orphans)}.")
    no_url = sum(1 for o in opportunities.values() if not o.url)
    if no_url:
        issue("info", "OPPORTUNITY_NO_URL", f"{no_url} opportunity leads have no URL.")

    return KnowledgeBase(
        version=version, careers=careers, stages=stages, resources=resources, skills=skills, projects=projects,
        communities=communities, opportunities=opportunities, learning_tracks=learning_tracks, advice=advice, issues=issues,
        counts={"careers": len(careers), "stages": len(stages), "resources": len(resources), "skills": len(skills),
                "projects": len(projects), "communities": len(communities), "opportunities": len(opportunities),
                "learningTracks": len(learning_tracks)},
    )


def _js_string(v: Any) -> str:
    """String(v) as JavaScript would print it, for the few scalar types a JSON record can hold."""
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v)
