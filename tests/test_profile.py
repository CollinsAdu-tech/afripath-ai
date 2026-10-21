import json
import re

from pathfinder.engine.profile import normalize_profile

codes = lambda lst: [x["code"] for x in lst]  # noqa: E731


def test_empty_profile_valid():
    r = normalize_profile({})
    assert r["errors"] == [] and r["warnings"] == []
    p = r["profile"]
    assert p["interests"] == [] and p["budget"] is None and p["mathConfidence"] is None


def test_non_object_is_error_not_crash():
    for bad in (None, "x", 5, [], True):
        r = normalize_profile(bad)
        assert r["profile"] is None and r["errors"][0]["code"] == "INVALID_TYPE"


def test_ids_normalised_and_deduplicated():
    p = normalize_profile({"interests": ["Web Building", "web-building", "WEB_BUILDING", "data_patterns"]})["profile"]
    assert p["interests"] == ["web_building", "data_patterns"]


def test_unknown_ids_warn():
    r = normalize_profile({"interests": ["web_building", "astrology"], "budget": "lots"})
    assert r["errors"] == []
    assert r["profile"]["interests"] == ["web_building"] and r["profile"]["budget"] is None
    assert codes(r["warnings"]) == ["UNKNOWN_OPTION", "UNKNOWN_OPTION"]


def test_wrong_types_are_errors():
    r = normalize_profile({"interests": "web_building", "budget": 5, "weeklyHours": {"a": 1}, "mathConfidence": True, "experienceByCareer": []})
    assert sorted(e["field"] for e in r["errors"]) == ["budget", "experienceByCareer", "interests", "mathConfidence", "weeklyHours"]


def test_numbers():
    assert normalize_profile({"mathConfidence": "4"})["profile"]["mathConfidence"] == 4
    assert normalize_profile({"weeklyHours": "3.5"})["profile"]["weeklyHours"] == 3.5
    r = normalize_profile({"mathConfidence": 9, "weeklyHours": 500})
    assert r["profile"]["mathConfidence"] is None and r["profile"]["weeklyHours"] is None
    assert codes(r["warnings"]) == ["OUT_OF_RANGE", "OUT_OF_RANGE"]
    assert normalize_profile({"weeklyHours": 0})["profile"]["weeklyHours"] == 0


def test_unknown_fields_privacy_warning():
    r = normalize_profile({"interests": ["web_building"], "fullName": "Ama Mensah", "email": "a@b.c"})
    assert "fullName" not in r["profile"] and "email" not in r["profile"]
    assert sum(1 for w in r["warnings"] if w["code"] == "UNKNOWN_FIELD") == 2
    assert re.search("personal information", r["warnings"][0]["message"], re.I)


def test_long_lists_capped():
    r = normalize_profile({"interests": ["data_patterns" if i % 2 == 0 else "web_building" for i in range(100)]})
    assert len(r["profile"]["interests"]) <= 2
    assert "TOO_MANY_VALUES" in codes(r["warnings"])


def test_experience_by_career_safe_keys():
    raw = json.loads('{"experienceByCareer":{"career_cybersecurity":"some","__proto__":"none","bad key!":"some","career_x":"expert"}}')
    r = normalize_profile(raw)
    assert list(r["profile"]["experienceByCareer"]) == ["career_cybersecurity"]
    assert len(r["warnings"]) == 3
