"""Small helpers that make Python behave like the JSON/JavaScript conventions the API contract was written in.

The API contract (docs/openapi.json) was defined with JavaScript semantics in mind, and the numbers it returns
must stay identical. Two details matter: floating-point sums must be added strictly left to right (Python 3.12+
`sum()` uses compensated summation and can differ in the last bit), and `Math.round` rounds halves up.
"""

from __future__ import annotations

import math
from collections.abc import Mapping
from typing import Any, Iterable


def seq_sum(values: Iterable[float], start: float = 0.0) -> float:
    """Left-to-right float addition (not `sum()`, which is compensated on Python 3.12+)."""
    total = start
    for v in values:
        total += v
    return total


def js_round(x: float) -> int:
    """Round half up, like JavaScript's Math.round (Python's round() rounds halves to even)."""
    return math.floor(x + 0.5)


def round1(n: float) -> float:
    """Round to one decimal place, half up."""
    return js_round(n * 10) / 10


def is_number(v: Any) -> bool:
    """A real JSON number (not a bool, which Python treats as an int)."""
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def is_finite(v: Any) -> bool:
    return is_number(v) and math.isfinite(v)


def is_integer(v: Any) -> bool:
    return is_number(v) and math.isfinite(v) and float(v).is_integer()


def is_obj(v: Any) -> bool:
    return isinstance(v, dict)


def arr(v: Any) -> list:
    return v if isinstance(v, list) else []


def text(v: Any) -> str | None:
    """A trimmed non-empty string, else None."""
    if isinstance(v, str) and v.strip():
        return v.strip()
    return None


def text_list(v: Any) -> list[str]:
    return [t for t in (text(x) for x in arr(v)) if t]


def _rank(ch: str) -> tuple[int, str]:
    # Locale-style ordering for ids made of [a-z0-9_]: punctuation < digits < letters.
    if ch == "_":
        return (0, ch)
    if ch.isdigit():
        return (1, ch)
    return (2, ch)


def locale_key(s: str) -> tuple:
    """Sort key that orders ids the way JavaScript's localeCompare does for lowercase ids with underscores."""
    return tuple(_rank(c) for c in s)


def js_json_value(o: Any) -> Any:
    """Make a value serialise like JSON.stringify: whole-number floats become ints, tuples/sets become lists."""
    if isinstance(o, bool) or o is None or isinstance(o, str):
        return o
    if isinstance(o, float):
        if math.isfinite(o) and o.is_integer():
            return int(o)
        return o
    if isinstance(o, int):
        return o
    if isinstance(o, Mapping):
        return {k: js_json_value(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [js_json_value(v) for v in o]
    if isinstance(o, (set, frozenset)):
        return [js_json_value(v) for v in sorted(o)]
    return o
