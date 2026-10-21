import copy
import json
import random
import re

import pytest
from conftest import profile_of, random_profile, top_ids

from pathfinder.engine import CONFIG, CareerNotFoundError, Engine, InputValidationError
from pathfinder.engine.options import QUESTIONNAIRE_OPTIONS
from pathfinder.engine.taxonomy import CAREER_TAXONOMY
from pathfinder.engine.validate import validate_recommendation_result
from pathfinder.knowledge import build_knowledge_base


def ID(s):
    return f"career_{s}"


# ---- scenario recommendations from synthetic students
def test_beginner_gets_introductory_technical_paths(engine):
    r = engine.recommend(profile_of("recommend_beginner_programming_ai"))
    ids = top_ids(r)
    assert r["status"] == "ok"
    assert ID("intro_to_coding") in ids and ID("ai_ml_engineering") in ids
    technical = {ID(x) for x in ["ai_ml_engineering", "full_stack_web_development", "intro_to_coding", "data_careers", "cloud_computing_aws"]}
    assert set(ids) <= technical, ids
    for rec in r["recommendations"]:
        assert rec["firstStep"]["text"]
        assert rec["roadmap"]["startingPoint"]["order"] == 1


def test_complete_beginner_is_pointed_to_intro_path(engine, kb):
    r = engine.recommend(profile_of("recommend_beginner_programming_ai"))
    ai = next(x for x in r["recommendations"] if x["careerId"] == ID("ai_ml_engineering"))
    assert ai["skillGaps"]["bridgePath"]["careerId"] == ID("intro_to_coding")
    assert ai["skillGaps"]["bridgePath"]["careerId"] in kb.careers
    assert any(p["dimension"] == "programming" for p in ai["skillGaps"]["prerequisites"])
    assert re.search(r"not a requirement", ai["skillGaps"]["prerequisites"][0]["message"], re.I)


def test_security_investigator(engine, kb):
    top = engine.recommend(profile_of("recommend_security_investigator"))["recommendations"][0]
    assert top["careerId"] == ID("cybersecurity")
    assert any(i["id"] == "security_investigation" for i in top["matched"]["interests"])
    assert any(i["id"] == "investigating" for i in top["matched"]["workStyles"])
    assert any(i["id"] == "protect_people_orgs" for i in top["matched"]["goals"])
    assert all(kb.projects[p["projectId"]].career_id == ID("cybersecurity") for p in top["projects"])
    assert any(p["safetyNote"] for p in top["projects"])


def test_project_management(engine):
    assert engine.recommend(profile_of("recommend_project_organizer"))["recommendations"][0]["careerId"] == ID("project_management")


def test_ai_safety_and_quantum(engine):
    assert engine.recommend(profile_of("recommend_ai_safety_governance"))["recommendations"][0]["careerId"] == ID("ai_safety")
    assert engine.recommend(profile_of("recommend_quantum_curious"))["recommendations"][0]["careerId"] == ID("quantum_computing")


# ---- missing answers
def test_missing_optional_answers_never_crash(engine):
    full = profile_of("recommend_beginner_programming_ai")
    for key in list(full):
        partial = {k: v for k, v in full.items() if k != key}
        engine.recommend(partial)
    for p in [{}, {"interests": []}, {"budget": None}, {"interests": ["web_building"]}, {"goals": ["start_business"]}]:
        engine.recommend(p)


def test_skipping_a_factor_renormalises_weights(engine):
    r = engine.recommend({"interests": ["data_patterns"], "currentSkills": ["analytical_thinking"]})
    for rec in r["recommendations"]:
        ev = [f for f in rec["factorBreakdown"] if f["status"] == "evaluated"]
        assert sorted(f["factor"] for f in ev) == ["interests", "strengths"]
        assert abs(sum(f["weightPercent"] for f in ev) - 100) < 0.2
        assert abs(next(f for f in ev if f["factor"] == "interests")["weightPercent"] - 58.3) < 0.2
        assert all(f["score"] is None and f["weightPercent"] == 0 for f in rec["factorBreakdown"] if f["status"] == "not_evaluated")


def test_invalid_answers_raise_typed_error(engine):
    with pytest.raises(InputValidationError) as e:
        engine.recommend(None)
    assert e.value.details[0]["field"] == "profile"
    with pytest.raises(InputValidationError) as e:
        engine.recommend({"interests": "web"})
    assert e.value.details[0]["field"] == "interests"


@pytest.mark.parametrize("p", [{}, {"workStyles": ["building"]}, {"goals": ["start_business"]},
                               {"workStyles": ["building"], "goals": ["start_business"]}])
def test_too_little_information_asks_for_more(engine, p):
    r = engine.recommend(p)
    assert r["status"] == "insufficient_information"
    assert r["recommendations"] == []
    assert r["missingInformation"][0]["factor"] == "interests"
    assert len(r["explore"]["otherCareers"]) == 9


def test_interests_alone_is_exploratory(engine):
    r = engine.recommend({"interests": ["data_patterns"]})
    assert r["status"] == "exploratory"
    for rec in r["recommendations"]:
        assert rec["fit"]["labelId"] == "early_signal" and rec["fit"]["basis"] == "limited_answers"
    assert any(re.search("early signal", n, re.I) for n in r["notes"])


def test_many_interests_flagged(engine):
    r = engine.recommend({"interests": [o["id"] for o in QUESTIONNAIRE_OPTIONS["interests"]]})
    assert any(re.search("many interests", n, re.I) for n in r["notes"])


# ---- determinism
def test_determinism(engine, kb):
    p = profile_of("recommend_beginner_programming_ai")
    a = json.dumps(engine.recommend(p))
    assert json.dumps(engine.recommend(copy.deepcopy(p))) == a
    assert json.dumps(Engine(kb).recommend(p)) == a
    shuffled = {**p, "interests": p["interests"][::-1], "currentSkills": p["currentSkills"][::-1]}
    b = engine.recommend(shuffled)
    base = engine.recommend(p)
    assert top_ids(b) == top_ids(base)
    assert [r["fit"]["score"] for r in b["recommendations"]] == [r["fit"]["score"] for r in base["recommendations"]]


def test_ties_are_ordered_by_career_id(kb):
    taxonomy = {**CAREER_TAXONOMY, "career_ai_safety": CAREER_TAXONOMY["career_cybersecurity"]}
    tied = Engine(kb, taxonomy=taxonomy)
    p = profile_of("recommend_security_investigator")
    for _ in range(5):
        r = tied.recommend(p)
        assert r["recommendations"][0]["fit"]["score"] == r["recommendations"][1]["fit"]["score"]
        assert top_ids(r)[:2] == [ID("ai_safety"), ID("cybersecurity")]


# ---- bounds and valid ids across generated students
def test_400_generated_students(engine, kb):
    rnd = random.Random(20261015)
    evaluated = 0
    for _ in range(400):
        p = random_profile(rnd)
        r = engine.recommend(p)
        check = validate_recommendation_result(r, kb)
        assert check["valid"], f"{p} -> {check['problems']}"
        for rec in r["recommendations"]:
            evaluated += 1
            assert 0 <= rec["fit"]["score"] <= 100
            assert abs(sum(f["contributionPoints"] for f in rec["factorBreakdown"]) - rec["fit"]["score"]) <= 0.3
            for f in rec["factorBreakdown"]:
                assert f["score"] is None or 0 <= f["score"] <= 100
            assert 1 <= rec["rank"] <= 3
        for o in r["explore"]["otherCareers"]:
            assert o["fitScore"] is None or 0 <= o["fitScore"] <= 100
        assert len(r["recommendations"]) <= 3
        scores = [x["fit"]["score"] for x in r["recommendations"]]
        assert scores == sorted(scores, reverse=True)
    assert evaluated > 400


def test_no_duplicates_and_explore_is_disjoint(engine):
    r = engine.recommend(profile_of("recommend_beginner_programming_ai"))
    rec = set(top_ids(r))
    assert len(rec) == len(r["recommendations"])
    assert all(o["careerId"] not in rec for o in r["explore"]["otherCareers"])
    assert len(rec) + len(r["explore"]["otherCareers"]) == 9


def test_max_results(engine):
    p = profile_of("recommend_beginner_programming_ai")
    assert len(engine.recommend(p, max_results=1)["recommendations"]) == 1
    assert len(engine.recommend(p, max_results=99)["recommendations"]) == 3


# ---- constraints never change fit
def test_constraints_never_change_scores(engine):
    base = profile_of("recommend_beginner_programming_ai")
    constrained = {**base, "budget": "none", "internet": "unreliable", "device": "phone_only", "weeklyHours": 1, "learningFormats": ["video"]}
    a, b = engine.recommend(base), engine.recommend(constrained)
    assert [(r["careerId"], r["fit"]["score"]) for r in b["recommendations"]] == [(r["careerId"], r["fit"]["score"]) for r in a["recommendations"]]
    assert b["explore"]["otherCareers"] == a["explore"]["otherCareers"]
    assert [r["factorBreakdown"] for r in b["recommendations"]] == [r["factorBreakdown"] for r in a["recommendations"]]


def test_cost_heavy_path_still_recommended_with_no_budget(engine):
    base = profile_of("recommend_security_investigator")
    r = engine.recommend({**base, "budget": "none", "internet": "unreliable", "device": "phone_only", "weeklyHours": 1})
    assert r["recommendations"][0]["careerId"] == ID("cybersecurity")
    assert r["recommendations"][0]["fit"]["score"] == engine.recommend(base)["recommendations"][0]["fit"]["score"]


def test_academic_prep_is_guidance_not_barrier(engine):
    q = profile_of("recommend_quantum_curious")
    a = next(r for r in engine.recommend({**q, "mathConfidence": 5})["recommendations"] if r["careerId"] == ID("quantum_computing"))
    b = next((r for r in engine.recommend({**q, "mathConfidence": 1})["recommendations"] if r["careerId"] == ID("quantum_computing")), None)
    assert b is not None
    assert a["fit"]["score"] - b["fit"]["score"] <= 7.5 + 0.1
    assert any(p["dimension"] == "math" for p in b["skillGaps"]["prerequisites"])
    assert b["roadmap"]["startingPoint"]["order"] == 1


def _score_of(result, cid):
    for r in result["recommendations"]:
        if r["careerId"] == cid:
            return r["fit"]["score"]
    return next(o["fitScore"] for o in result["explore"]["otherCareers"] if o["careerId"] == cid)


def test_experienced_coder_intro_path_less_relevant(engine):
    p = {"interests": ["web_building"], "currentSkills": ["programming"], "programmingExperience": "strong", "workStyles": ["building"]}
    exp = _score_of(engine.recommend(p, max_results=3), ID("intro_to_coding"))
    beg = _score_of(engine.recommend({**p, "programmingExperience": "none"}), ID("intro_to_coding"))
    assert exp < beg


def test_changing_interests_changes_ranking(engine):
    base = {"currentSkills": ["problem_solving"], "workStyles": ["building"]}
    cyber = engine.recommend({**base, "interests": ["security_investigation"]})
    pm = engine.recommend({**base, "interests": ["organizing_projects"]})
    web = engine.recommend({**base, "interests": ["web_building"]})
    assert cyber["recommendations"][0]["careerId"] == ID("cybersecurity")
    assert pm["recommendations"][0]["careerId"] == ID("project_management")
    assert web["recommendations"][0]["careerId"] == ID("full_stack_web_development")
    assert top_ids(cyber) != top_ids(pm)


def test_weights_are_centralised(engine, kb):
    p = {"interests": ["web_building"], "goals": ["research"]}
    base = engine.recommend(p)["recommendations"][0]["careerId"]
    cfg = {**CONFIG, "weights": {"interests": 0, "strengths": 0, "workStyle": 0, "academic": 0, "goals": 1}}
    r = Engine(kb, config=cfg).recommend(p)
    assert r["recommendations"][0]["careerId"] != base
    assert r["recommendations"][0]["careerId"] == ID("quantum_computing")


def test_shipped_weights_match_spec():
    assert dict(CONFIG["weights"]) == {"interests": 0.35, "strengths": 0.25, "workStyle": 0.15, "academic": 0.15, "goals": 0.10}


def test_resource_counts_do_not_influence_scores(engine, raw_kb):
    raw_kb["resources"] = [r for r in raw_kb["resources"] if not r["resource_id"].startswith("cyber_res_")]
    raw_kb["projects"] = [x for x in raw_kb["projects"] if x.get("career_id") != ID("cybersecurity")]
    lean = build_knowledge_base(raw_kb)
    assert len(lean.resources) < len(engine.kb.resources)
    lean_engine = Engine(lean)
    for name in ["recommend_security_investigator", "recommend_beginner_programming_ai", "recommend_project_organizer"]:
        p = profile_of(name)

        def scores(e):
            r = e.recommend(p)
            return {**{x["careerId"]: x["fit"]["score"] for x in r["recommendations"]},
                    **{o["careerId"]: o["fitScore"] for o in r["explore"]["otherCareers"]}}
        assert scores(lean_engine) == scores(engine), name


# ---- language safety
BANNED = re.compile(r"\b(guarantee[sd]?|perfect(ly)?|only path|the one|best career for you|you will succeed|will definitely|unsuitable|not for you|can't succeed|cannot succeed|not cut out|destined)\b", re.I)


def test_explanations_never_overpromise(engine):
    rnd = random.Random(7)
    for _ in range(150):
        r = engine.recommend(random_profile(rnd))
        m = BANNED.search(json.dumps(r))
        assert not m, m and m.group(0)
        for rec in r["recommendations"]:
            assert re.search("not a prediction of success", rec["fit"]["disclaimer"], re.I)
        assert re.search("not a prediction of success", r["scoreNote"], re.I)


def test_response_is_heuristic_and_offers_exploration(engine):
    r = engine.recommend(profile_of("recommend_security_investigator"))
    assert r["recommendations"][0]["fit"]["kind"] == "heuristic_fit_score"
    assert len(r["explore"]["otherCareers"]) >= 6 and r["explore"]["hint"]
    assert r["recommendations"][0]["roadmapRequest"]["path"] == "/v1/roadmaps"


def test_list_and_get_careers(engine):
    assert len(engine.list_careers()) == 9
    assert len(engine.get_career(ID("cybersecurity"))["stages"]) == 4
    for bad in ("nope",):
        with pytest.raises(CareerNotFoundError):
            engine.get_career(bad)
        with pytest.raises(CareerNotFoundError):
            engine.roadmap({}, bad)
    with pytest.raises(CareerNotFoundError):
        engine.roadmap({}, None)
