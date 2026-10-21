"""Keeps the option enums in docs/openapi.json in sync with the engine's questionnaire options.
docs/openapi.json is the hand-maintained contract of record (the React app generates its types from it);
tests/test_contract.py fails if it drifts from the engine. Run this after changing options.py."""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from pathfinder.engine import CONFIG  # noqa: E402
from pathfinder.engine.options import QUESTIONNAIRE_OPTIONS as O  # noqa: E402

path = ROOT / "docs" / "openapi.json"
spec = json.loads(path.read_text("utf-8"))
ids = lambda lst: [o if isinstance(o, str) else o["id"] for o in lst]  # noqa: E731
p = spec["components"]["schemas"]["StudentProfile"]["properties"]
for field, group in [("interests", "interests"), ("currentSkills", "strengths"), ("skillsToDevelop", "strengths"),
                     ("workStyles", "workStyles"), ("goals", "goals"), ("subjects", "subjects"), ("learningFormats", "learningFormats")]:
    p[field]["items"]["enum"] = ids(O[group])
for field in ["programmingExperience", "scienceBackground", "educationLevel", "budget", "internet", "device"]:
    p[field]["enum"] = [*ids(O[field]), None]
spec["components"]["schemas"]["FactorBreakdown"]["properties"]["factor"]["enum"] = list(CONFIG["weights"].keys())
path.write_text(json.dumps(spec, indent=2, ensure_ascii=False) + "\n", "utf-8")
print("docs/openapi.json enums synced with the engine options")
