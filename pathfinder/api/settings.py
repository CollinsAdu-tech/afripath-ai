"""Server settings, read from environment variables (all optional). No secrets are required."""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Mapping

ROOT = Path(__file__).resolve().parents[2]


def _int(v: str | None, default: int, lo: int, hi: int) -> int:
    """Like Number.parseInt(v, 10): reads a leading integer, ignores trailing text, falls back to the default."""
    if v is None:
        return default
    m = re.match(r"^\s*([+-]?\d+)", v)
    if not m:
        return default
    n = int(m.group(1))
    return n if lo <= n <= hi else default


@dataclass(frozen=True)
class Settings:
    port: int = 8080
    host: str = "0.0.0.0"
    kb_dir: Path = ROOT / "data" / "kb-v0.7"
    cors_allowed_origins: tuple[str, ...] = field(default_factory=tuple)  # () = CORS disabled; ("*",) = any origin
    max_body_bytes: int = 32 * 1024
    log_requests: bool = True
    enable_docs: bool = True

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> "Settings":
        env = os.environ if env is None else env
        origins = tuple(s.strip() for s in (env.get("CORS_ALLOWED_ORIGINS") or "").split(",") if s.strip())
        return cls(
            port=_int(env.get("PORT"), 8080, 0, 65535),
            host=env.get("HOST") or "0.0.0.0",
            kb_dir=Path(env["KB_DIR"]).resolve() if env.get("KB_DIR") else ROOT / "data" / "kb-v0.7",
            cors_allowed_origins=origins,
            max_body_bytes=_int(env.get("MAX_BODY_BYTES"), 32 * 1024, 1024, 1024 * 1024),
            log_requests=env.get("LOG_REQUESTS") != "false",
            enable_docs=env.get("ENABLE_DOCS") != "false",
        )
