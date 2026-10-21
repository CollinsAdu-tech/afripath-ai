"""File-reading helper: loads the ``combined_*.json`` files from a directory and builds the knowledge base.

Kept apart from base.py so the pure builder can be used and tested without file access.
"""

from __future__ import annotations

import json
from pathlib import Path

from ..errors import KnowledgeBaseError
from .base import KnowledgeBase, SUPPORTED_KB_VERSION, build_knowledge_base

REQUIRED = ["careers", "roadmap_stages", "resources", "skills", "projects", "communities", "opportunities"]
OPTIONAL = ["learning_tracks", "advice"]  # missing optional files are tolerated


def load_knowledge_base_from_dir(directory: str | Path, version: str = SUPPORTED_KB_VERSION) -> KnowledgeBase:
    if not directory:
        raise KnowledgeBaseError("Knowledge-base directory was not provided.")
    base = Path(directory)
    raw: dict = {}
    for name in [*REQUIRED, *OPTIONAL]:
        file = f"combined_{name}.json"
        try:
            raw[name] = json.loads((base / file).read_text(encoding="utf-8"))
        except FileNotFoundError:
            if name in OPTIONAL:
                continue
            raise KnowledgeBaseError(f'Could not read knowledge-base file "{file}" in "{directory}": file not found',
                                     [{"severity": "error", "code": "KB_FILE_UNREADABLE", "message": file}]) from None
        except (OSError, ValueError) as e:
            raise KnowledgeBaseError(f'Could not read knowledge-base file "{file}" in "{directory}": {e}',
                                     [{"severity": "error", "code": "KB_FILE_UNREADABLE", "message": file}]) from e
    return build_knowledge_base(raw, version)
