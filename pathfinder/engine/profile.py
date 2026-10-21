"""Converts raw questionnaire answers into a consistent, validated student profile.

Contract:
 - Never raises.
 - ``errors``   : the request is malformed (wrong type/shape). The caller should reject it.
 - ``warnings`` : something was ignored (unknown option id, unknown field, out-of-range number).
 - Missing / empty answers stay None or [] and are treated by the engine as "not answered",
   never as lack of ability or interest.
 - Only the fields below are read. Anything else is ignored with a warning, so a frontend does not
   accidentally send (and a deployment does not accidentally process) personal data.
"""

from __future__ import annotations

import math
import re
from typing import Any

from ..util import is_number
from .config import CONFIG
from .options import QUESTIONNAIRE_OPTIONS as O


def slug(v: Any) -> str:
    s = _js_string(v).strip().lower()
    s = re.sub(r"[\s\-/]+", "_", s)
    return re.sub(r"[^a-z0-9_]", "", s)


def _js_string(v: Any) -> str:
    return v if isinstance(v, str) else str(v)


def _ids_of(items: list) -> frozenset:
    return frozenset(o if isinstance(o, str) else o["id"] for o in items)


ARRAY_FIELDS = {
    "interests": _ids_of(O["interests"]),
    "currentSkills": _ids_of(O["strengths"]),
    "skillsToDevelop": _ids_of(O["strengths"]),
    "workStyles": _ids_of(O["workStyles"]),
    "goals": _ids_of(O["goals"]),
    "subjects": _ids_of(O["subjects"]),
    "learningFormats": _ids_of(O["learningFormats"]),
}
ENUM_FIELDS = {
    "programmingExperience": _ids_of(O["programmingExperience"]),
    "scienceBackground": _ids_of(O["scienceBackground"]),
    "educationLevel": _ids_of(O["educationLevel"]),
    "budget": _ids_of(O["budget"]),
    "internet": _ids_of(O["internet"]),
    "device": _ids_of(O["device"]),
}
NUMBER_FIELDS = ("mathConfidence", "weeklyHours", "experienceByCareer")
KNOWN_FIELDS = frozenset([*ARRAY_FIELDS.keys(), *ENUM_FIELDS.keys(), *NUMBER_FIELDS])

_DECIMAL = re.compile(r"^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$")


def _is_blank(v: Any) -> bool:
    return v is None or v == ""


def to_number(v: Any) -> float:
    """Accepts a finite number or a numeric string; rejects booleans, arrays, objects (returns NaN)."""
    nan = float("nan")
    if is_number(v):
        return v if math.isfinite(v) else nan
    if isinstance(v, str) and v.strip() != "":
        s = v.strip()
        if _DECIMAL.match(s):
            try:
                return float(s)
            except ValueError:
                return nan
        if re.match(r"^0[xX][0-9a-fA-F]+$", s) or re.match(r"^0[bB][01]+$", s) or re.match(r"^0[oO][0-7]+$", s):
            return float(int(s, 0))
        return nan
    return nan


def _whole(n: float) -> Any:
    return int(n) if math.isfinite(n) and float(n).is_integer() else n


def normalize_profile(raw: Any) -> dict:
    """Returns ``{"profile": dict | None, "warnings": [...], "errors": [...]}``."""
    warnings: list[dict] = []
    errors: list[dict] = []

    def warn(field: str, code: str, message: str) -> None:
        warnings.append({"field": field, "code": code, "message": message})

    def fail(field: str, code: str, message: str) -> None:
        errors.append({"field": field, "code": code, "message": message})

    if not isinstance(raw, dict):
        fail("profile", "INVALID_TYPE", "The student profile must be an object of questionnaire answers.")
        return {"profile": None, "warnings": warnings, "errors": errors}

    for key in raw.keys():
        if key not in KNOWN_FIELDS:
            k = str(key)[:40]
            warn(k, "UNKNOWN_FIELD", f'"{k}" is not a questionnaire field and was ignored. Do not send personal information.')

    profile: dict[str, Any] = {}
    max_n = CONFIG["limits"]["maxArrayAnswers"]

    for field, allowed in ARRAY_FIELDS.items():
        v = raw.get(field)
        if _is_blank(v):
            profile[field] = []
            continue
        if not isinstance(v, list):
            fail(field, "INVALID_TYPE", f'"{field}" must be a list of option ids.')
            profile[field] = []
            continue
        out: list[str] = []
        for item in v[:max_n]:
            if not isinstance(item, str):
                warn(field, "IGNORED_VALUE", f'Ignored a non-text value in "{field}".')
                continue
            sid = slug(item)
            if sid not in allowed:
                warn(field, "UNKNOWN_OPTION", f'Ignored unknown option "{item[:40]}" in "{field}".')
                continue
            if sid not in out:
                out.append(sid)
        if len(v) > max_n:
            warn(field, "TOO_MANY_VALUES", f'Only the first {max_n} answers in "{field}" were used.')
        profile[field] = out

    for field, allowed in ENUM_FIELDS.items():
        v = raw.get(field)
        if _is_blank(v):
            profile[field] = None
            continue
        if not isinstance(v, str):
            fail(field, "INVALID_TYPE", f'"{field}" must be a text option id.')
            profile[field] = None
            continue
        sid = slug(v)
        if sid not in allowed:
            warn(field, "UNKNOWN_OPTION", f'Ignored unknown value "{v[:40]}" for "{field}".')
            profile[field] = None
            continue
        profile[field] = sid

    mc = raw.get("mathConfidence")
    profile["mathConfidence"] = None
    if not _is_blank(mc):
        n = to_number(mc)
        if math.isfinite(n) and float(n).is_integer() and 1 <= n <= 5:
            profile["mathConfidence"] = int(n)
        elif is_number(mc) or isinstance(mc, str):
            warn("mathConfidence", "OUT_OF_RANGE", 'Ignored "mathConfidence": expected a whole number from 1 to 5.')
        else:
            fail("mathConfidence", "INVALID_TYPE", '"mathConfidence" must be a whole number from 1 to 5.')

    wh = raw.get("weeklyHours")
    profile["weeklyHours"] = None
    if not _is_blank(wh):
        n = to_number(wh)
        if math.isfinite(n) and 0 <= n <= 80:
            profile["weeklyHours"] = _whole(n)
        elif is_number(wh) or isinstance(wh, str):
            warn("weeklyHours", "OUT_OF_RANGE", 'Ignored "weeklyHours": expected a number from 0 to 80.')
        else:
            fail("weeklyHours", "INVALID_TYPE", '"weeklyHours" must be a number from 0 to 80.')

    # Optional prior experience per career id: 'none' | 'some' | 'solid'. Lets a returning student skip ahead.
    profile["experienceByCareer"] = {}
    ebc = raw.get("experienceByCareer")
    if not _is_blank(ebc):
        if not isinstance(ebc, dict):
            fail("experienceByCareer", "INVALID_TYPE",
                 '"experienceByCareer" must be an object mapping career ids to "none", "some" or "solid".')
        else:
            for cid, lvl in ebc.items():
                lv = slug(lvl) if isinstance(lvl, str) else ""
                if cid != "__proto__" and re.fullmatch(r"[a-z0-9_]{1,80}", cid) and lv in ("none", "some", "solid"):
                    profile["experienceByCareer"][cid] = lv
                else:
                    warn("experienceByCareer", "IGNORED_VALUE", f'Ignored experience entry for "{cid[:40]}".')
    return {"profile": profile, "warnings": warnings, "errors": errors}
