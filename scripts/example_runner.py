"""Runs every file in examples/requests and examples/errors against the REAL ASGI app and returns the responses.
Used by generate_examples.py (writes them) and by the test suite (checks the committed files are not stale)."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from fastapi.testclient import TestClient  # noqa: E402

from pathfinder.api.app import create_app  # noqa: E402
from pathfinder.api.settings import Settings  # noqa: E402

EXAMPLES_DIR = ROOT / "examples"


def _scrub(body):
    return json.loads(re.sub(r'"requestId":"[^"]+"', '"requestId":"<request-id>"', json.dumps(body, separators=(",", ":"))))


def run_examples() -> dict:
    app = create_app(Settings(log_requests=False))
    client = TestClient(app)
    out: dict = {}
    for f in sorted((EXAMPLES_DIR / "requests").iterdir()):
        body = json.loads(f.read_text("utf-8"))
        path = "/v1/roadmaps" if f.name.startswith("roadmap_") else "/v1/recommendations"
        res = client.post(path, content=json.dumps(body), headers={"content-type": "application/json"})
        out[f"responses/{f.name}"] = {"httpStatus": res.status_code, "body": _scrub(res.json())}
    for f in sorted((EXAMPLES_DIR / "errors").iterdir()):
        c = json.loads(f.read_text("utf-8"))
        content = None
        if c["method"] == "POST":
            content = c["rawBody"] if c.get("rawBody") is not None else json.dumps(c.get("body"))
        res = client.request(c["method"], c["path"], headers=c.get("headers"), content=content)
        out[f"responses/error_{f.name}"] = {"httpStatus": res.status_code, "body": _scrub(res.json())}
    for name, path in [("health", "/health"), ("options", "/v1/options"), ("careers", "/v1/careers"),
                       ("career_detail", "/v1/careers/career_cybersecurity")]:
        res = client.get(path)
        body = res.json()
        if name == "health":
            body["uptimeSeconds"] = 0  # varies per run
        out[f"responses/get_{name}.json"] = {"httpStatus": res.status_code, "body": body}
    return out
