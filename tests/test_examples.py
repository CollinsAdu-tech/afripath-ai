import json
import sys

from conftest import ROOT

sys.path.insert(0, str(ROOT / "scripts"))
from example_runner import EXAMPLES_DIR, run_examples  # noqa: E402


def test_committed_examples_match_live_responses():
    live = run_examples()
    assert len(live) >= 20
    for file, content in live.items():
        assert json.loads((EXAMPLES_DIR / file).read_text("utf-8")) == content, f"{file} is stale (run python scripts/generate_examples.py)"


def test_examples_cover_statuses():
    live = run_examples()
    assert {200, 400, 404, 405, 415, 422} <= {x["httpStatus"] for x in live.values()}
    assert {"ok", "exploratory", "insufficient_information"} <= {x["body"].get("status") for x in live.values()}
