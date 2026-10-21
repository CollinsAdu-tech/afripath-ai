"""Regenerates examples/responses/* from the real app. Run after changing the engine, taxonomy or data."""

import json

from example_runner import EXAMPLES_DIR, run_examples

(EXAMPLES_DIR / "responses").mkdir(parents=True, exist_ok=True)
out = run_examples()
for file, content in out.items():
    (EXAMPLES_DIR / file).write_text(json.dumps(content, indent=2, ensure_ascii=False) + "\n", "utf-8")
print(f"Wrote {len(out)} example responses to examples/responses/")
