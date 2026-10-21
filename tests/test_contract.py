import json
import sys

from conftest import ROOT, client_for

sys.path.insert(0, str(ROOT / "scripts"))
from example_runner import run_examples  # noqa: E402

from pathfinder.engine import CONFIG  # noqa: E402
from pathfinder.engine.options import QUESTIONNAIRE_OPTIONS as O  # noqa: E402

SPEC = json.loads((ROOT / "docs" / "openapi.json").read_text("utf-8"))
ids = lambda lst: [o if isinstance(o, str) else o["id"] for o in lst]  # noqa: E731


def test_openapi_enums_match_engine_options():
    p = SPEC["components"]["schemas"]["StudentProfile"]["properties"]
    assert p["interests"]["items"]["enum"] == ids(O["interests"])
    assert p["currentSkills"]["items"]["enum"] == ids(O["strengths"])
    assert p["workStyles"]["items"]["enum"] == ids(O["workStyles"])
    assert p["goals"]["items"]["enum"] == ids(O["goals"])
    assert p["subjects"]["items"]["enum"] == ids(O["subjects"])
    for k in ("budget", "internet", "device"):
        assert p[k]["enum"] == [*ids(O[k]), None]
    assert p["currentSkills"]["maxItems"] == CONFIG["limits"]["maxArrayAnswers"]
    assert SPEC["components"]["schemas"]["FactorBreakdown"]["properties"]["factor"]["enum"] == list(CONFIG["weights"].keys())


def test_every_documented_path_routable(engine):
    c = client_for(engine)
    for path, ops in SPEC["paths"].items():
        for method in ops:
            url = path.replace("{careerId}", "career_cybersecurity")
            body = None
            if method == "post":
                body = json.dumps({"careerId": "career_cybersecurity"} if path == "/v1/roadmaps" else {"profile": {}})
            res = c.request(method.upper(), url, headers={"content-type": "application/json"}, content=body)
            assert res.status_code == 200, f"{method} {path}"


def test_error_codes_declared():
    declared = set(SPEC["components"]["schemas"]["ErrorResponse"]["properties"]["error"]["properties"]["code"]["enum"])
    for v in run_examples().values():
        if "error" in v["body"]:
            assert v["body"]["error"]["code"] in declared


def test_status_enum():
    assert SPEC["components"]["schemas"]["RecommendationResponse"]["properties"]["status"]["enum"] == ["ok", "exploratory", "insufficient_information"]
