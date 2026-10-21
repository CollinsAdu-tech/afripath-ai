import json
import re

import pytest
from conftest import example
from fastapi.testclient import TestClient

from pathfinder.api.app import create_app
from pathfinder.api.handlers import Handlers
from pathfinder.api.settings import Settings
from pathfinder.engine import Engine

BASE = Settings(log_requests=False)
JSON_H = {"content-type": "application/json"}


def client_for(engine, **settings):
    return TestClient(create_app(Settings(**{"log_requests": False, **settings}), engine=engine), raise_server_exceptions=False)


@pytest.fixture(scope="module")
def c(engine):
    return client_for(engine)


def post(client, path, body, headers=None):
    data = body if isinstance(body, str) else json.dumps(body)
    return client.post(path, content=data, headers={**JSON_H, **(headers or {})})


def test_health(c):
    r = c.get("/health")
    b = r.json()
    assert r.status_code == 200 and b["status"] == "ok"
    assert b["knowledgeBase"]["loaded"] is True and b["knowledgeBase"]["version"] == "0.7" and b["knowledgeBase"]["counts"]["careers"] == 9


def test_options(c):
    b = c.get("/v1/options").json()
    assert len(b["options"]["interests"]) == 9 and b["options"]["interests"][0]["id"] and b["options"]["interests"][0]["label"]
    assert b["factorWeights"]["interests"] == 0.35


def test_careers(c):
    assert len(c.get("/v1/careers").json()["careers"]) == 9
    one = c.get("/v1/careers/career_cybersecurity")
    assert one.status_code == 200 and len(one.json()["stages"]) == 4
    assert c.get("/v1/careers/").status_code == 200
    missing = c.get("/v1/careers/career_nope")
    assert missing.status_code == 404 and missing.json()["error"]["code"] == "CAREER_NOT_FOUND"
    assert c.get("/v1/careers/%E0%A4%A").status_code == 404


def test_recommendations(c):
    r = post(c, "/v1/recommendations", example("recommend_security_investigator"))
    b = r.json()
    assert r.status_code == 200 and b["recommendations"][0]["careerId"] == "career_cybersecurity"
    for k in ["status", "message", "scoreNote", "recommendations", "explore", "evidence", "missingInformation", "warnings", "meta"]:
        assert k in b, k
    for k in ["rank", "careerId", "title", "fit", "explanation", "matched", "factorBreakdown", "skillGaps", "firstStep", "roadmap",
              "startingResources", "projects", "accessConsiderations", "roadmapRequest"]:
        assert k in b["recommendations"][0], k


def test_empty_profile_is_200(c):
    r = post(c, "/v1/recommendations", {"profile": {}})
    assert r.status_code == 200 and r.json()["status"] == "insufficient_information" and r.json()["recommendations"] == []


def test_max_results(c):
    ok = post(c, "/v1/recommendations", {**example("recommend_beginner_programming_ai"), "options": {"maxResults": 2}}).json()
    assert len(ok["recommendations"]) == 2
    for bad in [0, 4, 1.5, "2", None, True]:
        r = post(c, "/v1/recommendations", {"profile": {}, "options": {"maxResults": bad}})
        assert r.status_code == 422, str(bad)
        assert r.json()["error"]["details"][0]["field"] == "options.maxResults"
    assert post(c, "/v1/recommendations", {"profile": {}, "options": "x"}).status_code == 422


def test_validation_errors_envelope(c):
    r = post(c, "/v1/recommendations", {"profile": {"interests": "web", "weeklyHours": []}})
    b = r.json()
    assert r.status_code == 422 and b["error"]["code"] == "VALIDATION_ERROR"
    assert sorted(d["field"] for d in b["error"]["details"]) == ["interests", "weeklyHours"]
    assert b["error"]["requestId"] == r.headers["x-request-id"]
    for body in ["{}", "[]", '"x"', "null", "5"]:
        assert post(c, "/v1/recommendations", body).status_code == 422, body
    assert post(c, "/v1/recommendations", {"profile": "x"}).status_code == 422


def test_warnings_not_failures_and_no_echo(c):
    r = post(c, "/v1/recommendations", {"profile": {"interests": ["web_building", "astrology"], "fullName": "Ama Mensah"}, "extra": 1})
    b = r.json()
    assert r.status_code == 200
    assert sorted(w["code"] for w in b["warnings"]) == ["UNKNOWN_FIELD", "UNKNOWN_FIELD", "UNKNOWN_OPTION"]
    assert "Ama Mensah" not in json.dumps(b)


def test_transport_errors(engine, c):
    bad = post(c, "/v1/recommendations", '{"profile": {')
    assert bad.status_code == 400 and bad.json()["error"]["code"] == "INVALID_JSON"
    assert c.post("/v1/recommendations", content="x", headers={"content-type": "text/plain"}).status_code == 415
    assert c.post("/v1/recommendations", content="{}").status_code == 415
    for const in ("NaN", "Infinity"):
        assert post(c, "/v1/recommendations", '{"profile": {"weeklyHours": %s}}' % const).status_code == 400
    small = client_for(engine, max_body_bytes=1024)
    big = post(small, "/v1/recommendations", json.dumps({"profile": {"interests": [], "pad": "x" * 3000}}))
    assert big.status_code == 413 and big.json()["error"]["code"] == "PAYLOAD_TOO_LARGE"


def test_roadmaps(c):
    ok = post(c, "/v1/roadmaps", example("roadmap_cybersecurity_constrained"))
    b = ok.json()
    assert ok.status_code == 200 and b["career"]["careerId"] == "career_cybersecurity" and len(b["stages"]) == 4
    assert post(c, "/v1/roadmaps", {"careerId": "career_nope"}).status_code == 404
    miss = post(c, "/v1/roadmaps", {"profile": {}})
    assert miss.status_code == 422 and miss.json()["error"]["details"][0]["field"] == "careerId"
    assert post(c, "/v1/roadmaps", {"careerId": "career_cybersecurity"}).status_code == 200
    assert post(c, "/v1/roadmaps", {"careerId": "career_cybersecurity", "profile": {"budget": 7}}).status_code == 422


def test_routing_errors(c):
    assert c.get("/nope").status_code == 404
    r = c.get("/v1/recommendations")
    assert r.status_code == 405 and r.headers["allow"] == "POST"
    assert post(c, "/health", "{}").status_code == 405
    assert c.delete("/v1/careers/x").status_code == 405


def test_headers(c):
    r = post(c, "/v1/recommendations", {"profile": {}}, {"x-request-id": "abc-123"})
    assert "application/json" in r.headers["content-type"] and r.headers["cache-control"] == "no-store"
    assert r.headers["x-content-type-options"] == "nosniff" and r.headers["x-request-id"] == "abc-123"
    bad = c.get("/health", headers={"x-request-id": "bad id with spaces<script>"})
    assert re.fullmatch(r"[0-9a-f-]{36}", bad.headers["x-request-id"])
    assert "max-age" in c.get("/v1/options").headers["cache-control"]


def test_cors(engine):
    off = client_for(engine).get("/health", headers={"origin": "https://app.example"})
    assert "access-control-allow-origin" not in off.headers
    named = client_for(engine, cors_allowed_origins=("https://app.example",))
    assert named.get("/health", headers={"origin": "https://app.example"}).headers["access-control-allow-origin"] == "https://app.example"
    assert "access-control-allow-origin" not in named.get("/health", headers={"origin": "https://evil.example"}).headers
    pre = named.options("/v1/recommendations", headers={"origin": "https://app.example", "access-control-request-method": "POST"})
    assert pre.status_code == 204 and "POST" in pre.headers["access-control-allow-methods"]
    anyc = client_for(engine, cors_allowed_origins=("*",))
    assert anyc.get("/health", headers={"origin": "http://localhost:5173"}).headers["access-control-allow-origin"] == "*"


def test_degraded_mode():
    app = create_app(BASE, engine=None, kb_error=Exception("Knowledge base is empty"))
    d = TestClient(app)
    h = d.get("/health")
    assert h.status_code == 503 and h.json()["status"] == "unavailable" and "empty" in h.json()["knowledgeBase"]["error"]
    for p in ["/v1/careers", "/v1/options", "/v1/careers/career_cybersecurity"]:
        assert d.get(p).status_code == 503, p
    r = post(d, "/v1/recommendations", {"profile": {}})
    assert r.status_code == 503 and r.json()["error"]["code"] == "KNOWLEDGE_BASE_UNAVAILABLE"
    assert d.get("/nope").status_code == 404


def test_internal_failure_is_generic(kb, capsys):
    class Boom(Engine):
        def recommend(self, *a, **k):
            raise RuntimeError("SECRET database password in stack")
    r = post(client_for(Boom(kb)), "/v1/recommendations", {"profile": {}})
    body = r.json()
    assert r.status_code == 500 and body["error"]["code"] == "INTERNAL_ERROR"
    assert "SECRET" not in json.dumps(body) and "Traceback" not in json.dumps(body)
    assert capsys.readouterr().err.count('"level":"error"') == 1


def test_refuses_result_failing_validation(kb):
    class Corrupt(Engine):
        def recommend(self, *a, **k):
            r = super().recommend(*a, **k)
            r["recommendations"][0]["startingResources"][0]["url"] = "https://invented.example"
            return r
    r = post(client_for(Corrupt(kb)), "/v1/recommendations", example("recommend_security_investigator"))
    assert r.status_code == 500 and "invented.example" not in r.text


def test_handlers_are_pure(engine):
    out = Handlers(engine).recommendations(example("recommend_project_organizer"))
    assert out["recommendations"][0]["careerId"] == "career_project_management"


def test_requests_logged_without_bodies(engine, capsys):
    c = client_for(engine, log_requests=True)
    post(c, "/v1/recommendations", {"profile": {"interests": ["security_investigation"]}})
    out = capsys.readouterr().out.strip().splitlines()
    assert len(out) == 1
    assert "security_investigation" not in out[0] and '"status":200' in out[0]
