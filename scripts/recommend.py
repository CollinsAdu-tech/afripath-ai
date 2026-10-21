"""Try the engine WITHOUT any server or front end:
    python scripts/recommend.py examples/requests/recommend_security_investigator.json
    python scripts/recommend.py examples/requests/roadmap_cybersecurity_constrained.json
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pathfinder.api.settings import Settings  # noqa: E402
from pathfinder.engine import Engine  # noqa: E402
from pathfinder.knowledge import load_knowledge_base_from_dir  # noqa: E402
from pathfinder.util import js_json_value  # noqa: E402

if len(sys.argv) < 2:
    sys.exit("Usage: python scripts/recommend.py <request.json>")
req = json.loads(Path(sys.argv[1]).read_text("utf-8"))
engine = Engine(load_knowledge_base_from_dir(str(Settings.from_env().kb_dir)))
try:
    if req.get("careerId"):
        result = engine.roadmap(req.get("profile") or {}, req["careerId"])
    else:
        result = engine.recommend(req.get("profile"), (req.get("options") or {}).get("maxResults"))
    print(json.dumps(js_json_value(result), indent=2, ensure_ascii=False))
except Exception as e:  # noqa: BLE001
    print(json.dumps({"error": {"code": getattr(e, "code", "ERROR"), "message": str(e), "details": getattr(e, "details", None)}}, indent=2), file=sys.stderr)
    sys.exit(1)
