import copy
import json
import random
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from pathfinder.engine import Engine  # noqa: E402
from pathfinder.knowledge import load_knowledge_base_from_dir  # noqa: E402

KB_DIR = ROOT / "data" / "kb-v0.7"
KB_FILES = ["careers", "roadmap_stages", "resources", "skills", "projects", "communities",
            "opportunities", "learning_tracks", "advice"]


@pytest.fixture(scope="session")
def kb():
    return load_knowledge_base_from_dir(str(KB_DIR))


@pytest.fixture(scope="session")
def engine(kb):
    return Engine(kb)


@pytest.fixture()
def raw_kb():
    """A fresh deep copy of the raw knowledge-base JSON, safe to mutate."""
    return {n: json.loads((KB_DIR / f"combined_{n}.json").read_text("utf-8")) for n in KB_FILES}


def example(name: str) -> dict:
    return json.loads((ROOT / "examples" / "requests" / f"{name}.json").read_text("utf-8"))


def profile_of(name: str) -> dict:
    return copy.deepcopy(example(name)["profile"])


def top_ids(result: dict) -> list[str]:
    return [r["careerId"] for r in result["recommendations"]]


def random_profile(rnd: random.Random) -> dict:
    from pathfinder.engine.options import QUESTIONNAIRE_OPTIONS as O

    def pick(items, mx):
        return [x for x in items if rnd.random() < mx / len(items)]

    ids = lambda k: [o["id"] for o in O[k]]  # noqa: E731
    maybe = lambda v: v if rnd.random() < 0.6 else None  # noqa: E731
    p = {
        "interests": pick(ids("interests"), 3), "currentSkills": pick(ids("strengths"), 3),
        "skillsToDevelop": pick(ids("strengths"), 2), "workStyles": pick(ids("workStyles"), 2),
        "goals": pick(ids("goals"), 2), "subjects": pick(ids("subjects"), 2),
        "mathConfidence": maybe(1 + int(rnd.random() * 5)),
        "programmingExperience": maybe(O["programmingExperience"][int(rnd.random() * 4)]),
        "scienceBackground": maybe(O["scienceBackground"][int(rnd.random() * 4)]),
        "budget": maybe(O["budget"][int(rnd.random() * 3)]),
        "internet": maybe(O["internet"][int(rnd.random() * 3)]),
        "device": maybe(O["device"][int(rnd.random() * 3)]),
        "weeklyHours": maybe(int(rnd.random() * 20)),
        "learningFormats": pick(O["learningFormats"], 2),
    }
    return {k: v for k, v in p.items() if v is not None}


def client_for(engine, **settings):
    from fastapi.testclient import TestClient

    from pathfinder.api.app import create_app
    from pathfinder.api.settings import Settings

    return TestClient(create_app(Settings(**{"log_requests": False, **settings}), engine=engine), raise_server_exceptions=False)
