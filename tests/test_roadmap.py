import json
import random
import re

import pytest
from conftest import example

from pathfinder.engine.options import QUESTIONNAIRE_OPTIONS as O
from pathfinder.engine.validate import validate_plan
from pathfinder.knowledge.base import normalize_url

CONSTRAINED = {"budget": "none", "internet": "unreliable", "device": "phone_only", "weeklyHours": 2, "learningFormats": ["text"]}


@pytest.fixture(scope="module")
def careers(kb):
    return list(kb.careers)


def test_every_career_and_profile_references_valid_records(engine, kb, careers):
    for cid in careers:
        for p in [{}, CONSTRAINED, {"experienceByCareer": {cid: "some"}, "programmingExperience": "strong"}, {"experienceByCareer": {cid: "solid"}}]:
            plan = engine.roadmap(p, cid)
            v = validate_plan(plan, kb)
            assert v["valid"], f"{cid}: {v['problems']}"
            assert len(plan["stages"]) == len(kb.careers[cid].stage_ids)


def test_no_resource_appears_twice(engine, kb, careers):
    for cid in careers:
        plan = engine.roadmap(CONSTRAINED, cid)
        ids = [r["resourceId"] for s in plan["stages"] for r in s["resources"]]
        assert len(set(ids)) == len(ids), cid
        urls = [u for u in (normalize_url(kb.resources[i].url) for i in ids) if u]
        assert len(set(urls)) == len(urls), f"{cid} duplicate URL"
    coding = engine.roadmap({}, "career_intro_to_coding")
    weeks = [sum(1 for a in s["activities"] if any(r["resourceId"] == "coding_res_replit" for r in a["resources"])) for s in coding["stages"]]
    assert all(n >= 1 for n in weeks)
    assert sum(1 for s in coding["stages"] for r in s["resources"] if r["resourceId"] == "coding_res_replit") == 1


def test_shared_urls_listed_once(engine):
    plan = engine.roadmap({}, "career_ai_safety")
    ids = [r["resourceId"] for s in plan["stages"] for r in s["resources"]]
    assert not ("res_ai_safety_future_of_ai_course" in ids and "res_ai_safety_ai_strategy_course" in ids)


def test_links_copied_from_kb(engine, kb, careers):
    for cid in careers:
        plan = engine.roadmap(CONSTRAINED, cid)
        for s in plan["stages"]:
            for r in s["resources"]:
                assert r["url"] == kb.resources[r["resourceId"]].url
            for c in s["communities"]:
                assert c["url"] == kb.communities[c["communityId"]].url
        for o in plan["opportunityLeads"]:
            assert o["url"] == kb.opportunities[o["opportunityId"]].url


def test_opportunities_never_open(engine, careers):
    for cid in careers:
        plan = engine.roadmap({}, cid)
        for o in plan["opportunityLeads"]:
            assert o["status"] == "unverified_lead"
            assert re.search("do not assume it is open", o["statusNote"], re.I)
        assert not re.search(r"\b(now open|applications? (are )?open|open for applications|fully funded)\b", json.dumps(plan), re.I)


def test_nothing_called_free_without_caveat(engine, careers):
    for cid in careers:
        for s in engine.roadmap({}, cid)["stages"]:
            for r in s["resources"]:
                assert r["access"]["costNote"]
                assert not re.fullmatch("free", r["access"]["cost"], re.I)
                assert r["verificationStatus"] and r["verificationStatus"] != "verified"
                assert r["linkStatus"] in ("unverified_link", "no_link_provided")
    res = [r for s in engine.roadmap({}, "career_intro_to_coding")["stages"] for r in s["resources"]]
    no_link = next(r for r in res if r["resourceId"] == "coding_res_crash_course")
    assert no_link["url"] is None and no_link["linkStatus"] == "no_link_provided"


def test_quarantined_projects_never_appear(engine, kb, careers):
    bad = {p.id for p in kb.projects.values() if p.quarantined}
    blob = json.dumps([engine.roadmap({}, c) for c in careers]) + json.dumps(engine.recommend(example("recommend_beginner_programming_ai")["profile"]))
    for i in bad:
        assert i not in blob, i
    assert "held back" in json.dumps(engine.roadmap({}, "career_ai_ml_engineering")["knowledgeGaps"])


def test_beginner_starts_at_first_stage(engine, kb, careers):
    for cid in careers:
        plan = engine.roadmap({"programmingExperience": "none"}, cid)
        assert plan["startingPoint"]["stageId"] == kb.careers[cid].stage_ids[0]
        assert plan["firstAction"]["text"], cid
        if plan["firstAction"]["resource"]:
            assert plan["firstAction"]["resource"]["resourceId"] in kb.resources
        assert [s["status"] for s in plan["stages"]] == ["start_here", "upcoming", "upcoming", "upcoming"]


def test_prior_experience_moves_start(engine):
    plan = engine.roadmap(example("roadmap_quantum_experienced")["profile"], "career_quantum_computing")
    assert plan["startingPoint"]["order"] == 2
    assert [s["status"] for s in plan["stages"]] == ["covered_by_your_answers", "start_here", "upcoming", "upcoming"]
    assert engine.roadmap({"experienceByCareer": {"career_cybersecurity": "solid"}}, "career_cybersecurity")["startingPoint"]["order"] == 3


def test_prerequisites_verbatim(engine):
    plan = engine.roadmap({}, "career_quantum_computing")
    assert plan["stages"][3]["prerequisitesPerSource"] == ["Understand basic quantum states and gates"]
    assert plan["stages"][0]["prerequisitesPerSource"] == []


def test_durations_as_text_no_deadlines(engine):
    plan = engine.roadmap({"weeklyHours": 5}, "career_cloud_computing_aws")
    assert plan["stages"][1]["durationPerSource"] == "Months 1–3"
    blob = json.dumps([[s["name"], s["focus"], s["actions"]] for s in plan["stages"]])
    assert not re.search(r"\b(deadline|by (january|february|march|april|may|june|july|august|september|october|november|december))\b", blob, re.I)
    assert "not turned into deadlines" in plan["pacing"]["note"]


def test_no_budget_flags_costly_resources_last(engine, careers):
    checked = 0
    for cid in careers:
        plan = engine.roadmap({"budget": "none"}, cid)
        for s in plan["stages"]:
            if any(a["day"] for a in s["activities"]):
                continue
            flags = [any(f["code"] == "check_cost" for f in r["flags"]) for r in s["resources"]]
            if True in flags:
                checked += 1
                assert all(flags[flags.index(True):]), f"{s['stageId']}: unflagged resource after a flagged one"
    assert checked > 0
    aws = engine.roadmap({"budget": "none"}, "career_cloud_computing_aws")
    assert any(a["code"] == "cost_may_apply" and a["resourceIds"] for a in aws["accessConsiderations"])
    assert not any(f["code"] == "check_cost" for f in aws["firstAction"]["flags"])
    n = lambda p: sum(len(s["resources"]) for s in p["stages"])  # noqa: E731
    assert n(aws) == n(engine.roadmap({}, "career_cloud_computing_aws"))


def test_limited_internet_puts_video_last(engine):
    plan = engine.roadmap({"internet": "unreliable"}, "career_cybersecurity")
    heavy = [r["access"]["dataUse"] == "video_heavy" for r in plan["stages"][0]["resources"]]
    assert True in heavy and all(heavy[heavy.index(True):])
    assert any(a["code"] == "data_use" for a in plan["accessConsiderations"])


def test_device_limits(engine):
    coding = engine.roadmap({"device": "phone_only"}, "career_intro_to_coding")
    msg = next(a for a in coding["accessConsiderations"] if a["code"] == "device")["message"]
    assert "Browser-based tools; no local development setup" in msg
    cyber = engine.roadmap({"device": "phone_only"}, "career_cybersecurity")
    assert "does not state device requirements" in next(a for a in cyber["accessConsiderations"] if a["code"] == "device")["message"]


def test_preferred_format_reorders_only(engine):
    plain = engine.roadmap({}, "career_full_stack_web_development")["stages"][0]["resources"]
    video = engine.roadmap({"learningFormats": ["video"]}, "career_full_stack_web_development")["stages"][0]["resources"]
    assert len(video) == len(plain)
    assert "video" in video[0]["access"]["formats"]


def test_pacing(engine):
    assert engine.roadmap({}, "career_cybersecurity")["pacing"] is None
    assert engine.roadmap({"weeklyHours": 1}, "career_cybersecurity")["pacing"]["suggestedItemsPerWeek"] == 1
    assert engine.roadmap({"weeklyHours": 4}, "career_cybersecurity")["pacing"]["suggestedItemsPerWeek"] == 2
    p = engine.roadmap({"weeklyHours": 10}, "career_cybersecurity")["pacing"]
    assert p["suggestedItemsPerWeek"] == 3 and len(p["firstWeek"]) == 3


def test_projects_ordered_by_difficulty(engine):
    beginner = engine.roadmap({"programmingExperience": "none"}, "career_quantum_computing")["projects"]
    assert beginner[0]["difficulty"] == "beginner"
    assert engine.roadmap({"programmingExperience": "strong"}, "career_quantum_computing")["projects"][0]["difficulty"] == "intermediate"
    assert len(beginner) == 5
    assert "not to individual stages" in " ".join(engine.roadmap({}, "career_quantum_computing")["knowledgeGaps"])


def test_data_gaps_stated(engine):
    plan = engine.roadmap({"mathConfidence": 1}, "career_quantum_computing")
    assert "no maths-specific resources" in " ".join(plan["knowledgeGaps"])


def test_data_careers_tracks(engine):
    plan = engine.roadmap({}, "career_data_careers")
    assert len(plan["learningTracks"]) == 5
    for t in plan["learningTracks"]:
        assert "not_independently_verified" in t["verificationStatus"]


def test_random_students_always_validate(engine, kb, careers):
    rnd = random.Random(99)
    for _ in range(120):
        p = {"budget": O["budget"][int(rnd.random() * 3)], "internet": O["internet"][int(rnd.random() * 3)],
             "device": O["device"][int(rnd.random() * 3)], "weeklyHours": int(rnd.random() * 30),
             "programmingExperience": O["programmingExperience"][int(rnd.random() * 4)],
             "mathConfidence": 1 + int(rnd.random() * 5), "learningFormats": [O["learningFormats"][int(rnd.random() * 5)]]}
        cid = careers[int(rnd.random() * len(careers))]
        v = validate_plan(engine.roadmap(p, cid), kb)
        assert v["valid"], f"{cid} {p} {v['problems']}"


def test_validator_catches_tampering(engine, kb):
    good = lambda: engine.roadmap({}, "career_cybersecurity")  # noqa: E731
    p = good(); p["stages"][0]["resources"][0]["resourceId"] = "res_made_up"
    assert not validate_plan(p, kb)["valid"]
    p = good(); p["stages"][0]["resources"][0]["url"] = "https://evil.example"
    assert "does not come from the knowledge base" in ",".join(validate_plan(p, kb)["problems"])
    p = good(); p["stages"][1]["resources"].append(dict(p["stages"][0]["resources"][0]))
    assert "duplicate" in ",".join(validate_plan(p, kb)["problems"])
    p = good(); p["opportunityLeads"][0]["status"] = "open"
    assert "must not claim a verified status" in ",".join(validate_plan(p, kb)["problems"])
    p = good(); p["projects"][0]["projectId"] = "proj_vulnerability_assessment"
    assert not validate_plan(p, kb)["valid"]
    assert not validate_plan(None, kb)["valid"]
