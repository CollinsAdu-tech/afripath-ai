"""Route logic. Pure functions of a parsed request, with no sockets, so the whole contract can be tested without
starting a server. All recommendation logic lives in pathfinder.engine; this file only validates the request
envelope and shapes the response.
"""

from __future__ import annotations

import time
from typing import Any

from ..engine import CareerNotFoundError, Engine, InputValidationError
from ..engine.validate import validate_plan, validate_recommendation_result
from ..util import is_integer, is_obj, js_round
from .errors import ApiError

SERVICE = "kareer-pathfinder-engine"

# method + path of every route; used for the Allow header on 405 responses.
ROUTE_METHODS: dict[str, str] = {
    "/health": "GET",
    "/v1/meta": "GET",
    "/v1/options": "GET",
    "/v1/careers": "GET",
    "/v1/recommendations": "POST",
    "/v1/roadmaps": "POST",
}


class InternalResultError(Exception):
    """A result failed validation against the knowledge base: never returned to the client."""


def _unknown_keys(body: dict, allowed: list[str]) -> list[dict]:
    out = []
    for k in body.keys():
        if k not in allowed:
            k40 = str(k)[:40]
            out.append({"field": k40, "code": "UNKNOWN_FIELD", "message": f'"{k40}" is not a recognised request field and was ignored.'})
    return out


def _expect_object(body: Any) -> None:
    if not is_obj(body):
        raise ApiError(422, "VALIDATION_ERROR", "The request body must be a JSON object.",
                       [{"field": "body", "code": "INVALID_TYPE", "message": "Send a JSON object."}])


class Handlers:
    def __init__(self, engine: Engine | None, kb_error: Exception | None = None, started_at: float | None = None) -> None:
        self.engine = engine
        self.kb_error = kb_error
        self.started_at = time.time() if started_at is None else started_at

    def _engine(self) -> Engine:
        if self.engine is None:
            raise ApiError(503, "KNOWLEDGE_BASE_UNAVAILABLE",
                           "The knowledge base could not be loaded, so recommendations are temporarily unavailable.")
        return self.engine

    def health(self) -> tuple[int, dict]:
        if self.engine is None:
            return 503, {"status": "unavailable", "service": SERVICE,
                         "knowledgeBase": {"loaded": False, "error": str(self.kb_error) if self.kb_error else "unknown error"}}
        info = self.engine.info()
        return 200, {
            "status": "ok", "service": SERVICE, "engineVersion": info["engineVersion"],
            "knowledgeBase": {"loaded": True, "version": info["knowledgeBaseVersion"], "counts": info["counts"]},
            "uptimeSeconds": js_round(time.time() - self.started_at),
        }

    def meta(self) -> dict:
        return self._engine().info()

    def options(self) -> dict:
        return self._engine().options()

    def careers(self) -> dict:
        e = self._engine()
        return {"careers": e.list_careers(), "meta": e.meta()}

    def career(self, career_id: str) -> dict:
        return self._engine().get_career(career_id)

    def recommendations(self, body: Any) -> dict:
        engine = self._engine()
        _expect_object(body)
        if "profile" not in body:
            raise ApiError(422, "VALIDATION_ERROR", 'The request is missing "profile".',
                           [{"field": "profile", "code": "REQUIRED", "message": '"profile" is required (it may be an empty object).'}])
        extra = _unknown_keys(body, ["profile", "options"])
        max_results = None
        if "options" in body:
            opts = body["options"]
            if not is_obj(opts):
                raise ApiError(422, "VALIDATION_ERROR", '"options" must be an object.',
                               [{"field": "options", "code": "INVALID_TYPE", "message": 'Send an object such as {"maxResults": 3}.'}])
            if "maxResults" in opts:
                n = opts["maxResults"]
                if not is_integer(n) or n < 1 or n > 3:
                    raise ApiError(422, "VALIDATION_ERROR", '"options.maxResults" must be a whole number from 1 to 3.',
                                   [{"field": "options.maxResults", "code": "OUT_OF_RANGE", "message": "Use 1, 2 or 3."}])
                max_results = int(n)
        result = engine.recommend(body["profile"], max_results)
        check = validate_recommendation_result(result, engine.kb)
        if not check["valid"]:
            raise InternalResultError(f"Result failed validation: {'; '.join(check['problems'][:3])}")
        result["warnings"] = [*result["warnings"], *extra]
        return result

    def roadmaps(self, body: Any) -> dict:
        engine = self._engine()
        _expect_object(body)
        cid = body.get("careerId")
        if not isinstance(cid, str) or not cid:
            raise ApiError(422, "VALIDATION_ERROR", 'The request is missing "careerId".',
                           [{"field": "careerId", "code": "REQUIRED", "message": '"careerId" must be a career id from GET /v1/careers.'}])
        extra = _unknown_keys(body, ["careerId", "profile"])
        profile = body.get("profile")
        plan = engine.roadmap({} if profile is None else profile, cid)
        check = validate_plan(plan, engine.kb)
        if not check["valid"]:
            raise InternalResultError(f"Roadmap failed validation: {'; '.join(check['problems'][:3])}")
        plan["warnings"] = [*plan["warnings"], *extra]
        return plan


def to_error_response(err: BaseException, request_id: str) -> tuple[int, dict, dict]:
    """Maps any raised error to a stable (status, body, headers) error envelope."""
    def base(status: int, code: str, message: str, details: Any = None, headers: dict | None = None):
        e: dict[str, Any] = {"code": code, "message": message}
        if details:
            e["details"] = details
        e["requestId"] = request_id
        return status, {"error": e}, headers or {}

    if isinstance(err, ApiError):
        return base(err.status, err.code, err.message, err.details, {"Allow": err.allow} if err.allow else None)
    if isinstance(err, InputValidationError):
        return base(422, "VALIDATION_ERROR", str(err), err.details)
    if isinstance(err, CareerNotFoundError):
        return base(404, "CAREER_NOT_FOUND", str(err))
    return base(500, "INTERNAL_ERROR", "Something went wrong on our side. Please try again.")
