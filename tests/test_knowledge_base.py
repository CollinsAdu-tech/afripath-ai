import copy
import re

import pytest

from pathfinder.engine import CONFIG, Engine
from pathfinder.errors import KnowledgeBaseError
from pathfinder.knowledge import build_knowledge_base, load_knowledge_base_from_dir


def test_real_kb_counts(kb):
    assert kb.counts == {"careers": 9, "stages": 36, "resources": 157, "skills": 102, "projects": 46,
                         "communities": 35, "opportunities": 33, "learningTracks": 5}
    assert kb.version == "0.7"


def test_career_ids_and_stage_order(kb):
    assert sorted(kb.careers) == [
        "career_ai_ml_engineering", "career_ai_safety", "career_cloud_computing_aws", "career_cybersecurity", "career_data_careers",
        "career_full_stack_web_development", "career_intro_to_coding", "career_project_management", "career_quantum_computing"]
    for c in kb.careers.values():
        assert len(c.stage_ids) == 4, c.id
        orders = [kb.stages[i].order for i in c.stage_ids]
        assert orders == sorted(orders)


def test_references_resolve(kb):
    for s in kb.stages.values():
        for r in s.resource_ids:
            assert r in kb.resources, f"{s.id} -> {r}"
        for a in s.activities:
            for r in a.resource_ids:
                assert r in kb.resources
        for c in s.community_ids:
            assert c in kb.communities
    assert not [i for i in kb.issues if i["code"] == "DANGLING_RESOURCE_REF"]


def test_quarantined_projects(kb):
    q = sorted(p.id for p in kb.projects.values() if p.quarantined)
    assert len(q) == 5
    for c in kb.careers.values():
        for i in c.project_ids:
            assert i not in q
    assert len([i for i in kb.issues if i["code"] == "PROJECT_CATEGORY_MISMATCH"]) == 5


def test_every_project_linked(kb):
    for p in kb.projects.values():
        if not p.quarantined:
            assert p.career_id, p.id


def test_opportunities_never_open(kb):
    assert all(o.status == "unverified_lead" for o in kb.opportunities.values())


def test_no_resource_verified_free(kb):
    for r in kb.resources.values():
        assert r.access["cost"] in ("may_involve_cost", "source_mentions_free", "unknown")
        assert re.search(r"check|verified", r.access["costNote"], re.I)
        assert r.verification_status != "verified"


def test_issues_reported(kb):
    codes = {i["code"] for i in kb.issues}
    for c in ["DUPLICATE_URL", "PROJECT_CATEGORY_MISMATCH", "RESOURCE_NO_URL", "RESOURCES_NOT_IN_ANY_STAGE", "PROJECT_SKILLS_BY_NAME"]:
        assert c in codes, c


def test_invalid_kbs_raise_clear_errors(raw_kb):
    with pytest.raises(KnowledgeBaseError, match=r"missing|not an object"):
        build_knowledge_base(None)
    with pytest.raises(KnowledgeBaseError):
        build_knowledge_base("x")
    with pytest.raises(KnowledgeBaseError, match='"careers" must be a list'):
        build_knowledge_base({})
    raw_kb["careers"] = []
    with pytest.raises(KnowledgeBaseError, match="(?i)empty") as e:
        build_knowledge_base(raw_kb)
    assert e.value.code == "KB_INVALID"


def test_missing_collection_named(raw_kb):
    del raw_kb["resources"]
    with pytest.raises(KnowledgeBaseError, match='"resources" must be a list'):
        build_knowledge_base(raw_kb)


def test_careers_without_titles(raw_kb):
    raw2 = copy.deepcopy(raw_kb)
    raw_kb["careers"] = [{"career_id": c["career_id"]} for c in raw_kb["careers"]]
    with pytest.raises(KnowledgeBaseError, match="(?i)no usable career"):
        build_knowledge_base(raw_kb)
    raw2["careers"][0].pop("title", None)
    raw2["careers"][0].pop("career_title", None)
    built = build_knowledge_base(raw2)
    assert len(built.careers) == 8
    assert any(i["code"] == "CAREER_NO_TITLE" for i in built.issues)


def test_duplicate_ids_keep_first(raw_kb):
    first_id = raw_kb["resources"][0]["resource_id"]
    raw_kb["resources"].append({**raw_kb["resources"][0], "title": "IMPOSTOR"})
    built = build_knowledge_base(raw_kb)
    assert len(built.resources) == 157
    assert built.resources[first_id].title != "IMPOSTOR"
    assert any(i["code"] == "DUPLICATE_ID" for i in built.issues)


def test_dangling_refs_and_odd_shapes(raw_kb):
    raw_kb["roadmap_stages"][0]["learning_activities"][0]["resource_id"] = "res_does_not_exist"
    raw_kb["resources"] += [None, 42, "text"]
    raw_kb["projects"].append(None)
    raw_kb["roadmap_stages"].append({"stage_id": "orphan_stage", "career_id": "career_nope", "level": 1})
    built = build_knowledge_base(raw_kb)
    assert any(i["code"] == "DANGLING_RESOURCE_REF" for i in built.issues)
    assert any(i["code"] == "STAGE_UNKNOWN_CAREER" for i in built.issues)
    assert "orphan_stage" not in built.stages
    for s in built.stages.values():
        for r in s.resource_ids:
            assert r in built.resources


def test_career_without_stages(raw_kb):
    raw_kb["roadmap_stages"] = [s for s in raw_kb["roadmap_stages"] if s.get("career_id") != "career_cybersecurity"]
    built = build_knowledge_base(raw_kb)
    assert any(i["code"] == "CAREER_NO_STAGES" and i["ref"] == "career_cybersecurity" for i in built.issues)
    plan = Engine(built).roadmap({}, "career_cybersecurity")
    assert plan["stages"] == [] and plan["firstAction"] is None


def test_loader_errors(tmp_path):
    with pytest.raises(KnowledgeBaseError, match=r"combined_careers\.json"):
        load_knowledge_base_from_dir("/definitely/not/here")
    with pytest.raises(KnowledgeBaseError):
        load_knowledge_base_from_dir("")
    for n in ["careers", "roadmap_stages", "resources", "skills", "projects", "communities", "opportunities"]:
        (tmp_path / f"combined_{n}.json").write_text("{not json" if n == "resources" else "[]")
    with pytest.raises(KnowledgeBaseError, match=r"combined_resources\.json"):
        load_knowledge_base_from_dir(str(tmp_path))


def test_engine_refuses_unscoreable_kb(raw_kb):
    for c in raw_kb["careers"]:
        c["career_id"] = f"x_{c['career_id']}"
    raw_kb["roadmap_stages"] = []
    raw_kb["skills"] = []
    raw_kb["projects"] = []
    raw_kb["opportunities"] = []
    with pytest.raises(KnowledgeBaseError, match=r"No career .* can be scored"):
        Engine(build_knowledge_base(raw_kb))


def test_engine_rejects_bad_taxonomy_and_weights(kb):
    with pytest.raises(KnowledgeBaseError, match="(?i)taxonomy is invalid"):
        Engine(kb, taxonomy={"career_cybersecurity": {"interests": {}}})
    with pytest.raises(KnowledgeBaseError, match="(?i)weights"):
        Engine(kb, config={**CONFIG, "weights": {"interests": 0, "strengths": 0, "workStyle": 0, "academic": 0, "goals": 0}})
