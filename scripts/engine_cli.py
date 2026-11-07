"""Runs the engine once from JSON on stdin and prints JSON. Used by the front-end tests so they use real engine
output:  echo '{"op":"recommend","profile":{...}}' | python scripts/engine_cli.py"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pathfinder.api.settings import Settings  # noqa: E402
from pathfinder.engine import Engine  # noqa: E402
from pathfinder.engine.profile import KNOWN_FIELDS  # noqa: E402
from pathfinder.knowledge import load_knowledge_base_from_dir  # noqa: E402
from pathfinder.util import js_json_value  # noqa: E402

req = json.load(sys.stdin)
e = Engine(load_knowledge_base_from_dir(str(Settings.from_env({}).kb_dir)))
op = req["op"]
if op == "recommend":
    out = e.recommend(req.get("profile"), req.get("maxResults"))
elif op == "roadmap":
    out = e.roadmap(req.get("profile") or {}, req["careerId"])
elif op == "careers":
    out = e.list_careers()
elif op == "options":
    out = e.options()
elif op == "known":
    out = sorted(KNOWN_FIELDS)
else:
    sys.exit(f"unknown op {op}")
print(json.dumps(js_json_value(out), ensure_ascii=False))
