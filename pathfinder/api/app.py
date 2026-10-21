"""FastAPI application: the HTTP adapter for the engine.

Transport concerns only: body size limit, JSON parsing, content-type, CORS, request ids, security headers and
request logging. Request bodies are never logged: they hold student answers.

The public contract (paths, status codes, error envelope, headers) is defined in docs/openapi.json and is
identical to the original Node.js implementation, so the React front end works with either.
"""

from __future__ import annotations

import json
import re
import sys
import time
import uuid
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import Response
from starlette.exceptions import HTTPException as StarletteHTTPException

from ..engine import CareerNotFoundError, Engine, InputValidationError
from ..knowledge import load_knowledge_base_from_dir
from ..util import js_json_value
from .errors import ApiError
from .handlers import ROUTE_METHODS, Handlers, to_error_response
from .settings import ROOT, Settings

REQUEST_ID = re.compile(r"^[A-Za-z0-9._-]{1,64}$")
_UNSET: Any = object()


class JsonResponse(Response):
    """Compact JSON, UTF-8 (no \\u escapes), whole-number floats written as integers (like JSON.stringify)."""
    media_type = "application/json; charset=utf-8"

    def render(self, content: Any) -> bytes:
        return json.dumps(js_json_value(content), ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def _log(obj: dict, stream: Any = None) -> None:
    (stream or sys.stdout).write(json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + "\n")
    (stream or sys.stdout).flush()


def _reject_constant(name: str) -> Any:
    raise ValueError(f"invalid JSON constant {name}")


def _cors_headers(settings: Settings, origin: str | None) -> dict[str, str]:
    allowed = settings.cors_allowed_origins
    if not allowed or not origin:
        return {}
    if "*" in allowed:
        return {"Access-Control-Allow-Origin": "*"}
    return {"Access-Control-Allow-Origin": origin, "Vary": "Origin"} if origin in allowed else {}


def create_app(settings: Settings | None = None, engine: Engine | None = _UNSET, kb_error: Exception | None = None) -> FastAPI:
    """Build the app. With no ``engine`` the knowledge base is loaded from ``settings.kb_dir``; if that fails the app
    still starts, answers /health with 503 and every other endpoint with 503 (so a deployment platform sees an
    unhealthy instance instead of a crash loop)."""
    settings = settings or Settings.from_env()
    if engine is _UNSET:
        engine = None
        try:
            engine = Engine(load_knowledge_base_from_dir(str(settings.kb_dir)))
        except Exception as e:  # noqa: BLE001
            kb_error = e
            _log({"level": "error", "message": f"Knowledge base failed to load: {e}",
                  "issues": getattr(e, "issues", [])[:5]}, sys.stderr)
    h = Handlers(engine, kb_error)

    docs = settings.enable_docs
    app = FastAPI(
        title="AfriPath AI - Pathfinder Engine API",
        description="Deterministic, explainable career-path recommendations from a curated knowledge base.",
        version="0.2.0",
        docs_url="/docs" if docs else None,
        redoc_url=None,
        openapi_url="/openapi.json" if docs else None,
        redirect_slashes=False,
    )

    spec_path = ROOT / "docs" / "openapi.json"

    def contract_openapi() -> dict:
        # docs/openapi.json is the contract of record (also used by the front end to generate its types).
        if not app.openapi_schema:
            try:
                app.openapi_schema = json.loads(spec_path.read_text(encoding="utf-8"))
            except OSError:
                app.openapi_schema = FastAPI.openapi(app)
        return app.openapi_schema

    app.openapi = contract_openapi  # type: ignore[method-assign]
    app.state.handlers = h

    # ------------------------------------------------------------------ middleware
    @app.middleware("http")
    async def transport(request: Request, call_next):  # noqa: ANN001
        started = time.perf_counter()
        inbound = request.headers.get("x-request-id")
        request_id = inbound if inbound and REQUEST_ID.match(inbound) else str(uuid.uuid4())
        original_path = request.url.path
        origin = request.headers.get("origin")
        # Trailing slashes are ignored: /v1/careers/ is /v1/careers.
        path = request.scope["path"]
        if len(path) > 1 and path.endswith("/"):
            request.scope["path"] = path.rstrip("/") or "/"
        request.state.request_id = request_id

        status: int
        out: Response
        try:
            if request.method == "OPTIONS":
                out = Response(status_code=204, headers={
                    **_cors_headers(settings, origin),
                    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type, X-Request-Id",
                    "Access-Control-Max-Age": "600",
                    "Content-Type": "application/json; charset=utf-8",
                    "Cache-Control": "no-store",
                })
            else:
                if request.method == "POST":
                    ctype = (request.headers.get("content-type") or "").split(";")[0].strip().lower()
                    if ctype != "application/json":
                        raise ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Send the request with Content-Type: application/json.")
                    request.state.body = await _read_json(request, settings.max_body_bytes)
                out = await call_next(request)
        except Exception as err:  # noqa: BLE001
            out = _error_response(err, request_id)
        out.headers.setdefault("Cache-Control", "no-store")
        out.headers["X-Content-Type-Options"] = "nosniff"
        out.headers["X-Request-Id"] = request_id
        for k, v in _cors_headers(settings, origin).items():
            out.headers[k] = v
        if settings.log_requests:
            _log({"level": "info", "requestId": request_id, "method": request.method, "path": original_path,
                  "status": out.status_code, "ms": round((time.perf_counter() - started) * 1000)})
        return out

    def _error_response(err: BaseException, request_id: str) -> Response:
        status, body, headers = to_error_response(err, request_id)
        if status == 500:
            _log({"level": "error", "requestId": request_id, "message": str(err)}, sys.stderr)
        r = JsonResponse(body, status_code=status)
        for k, v in headers.items():
            r.headers[k] = v
        r.headers["Cache-Control"] = "no-store"
        return r

    # ------------------------------------------------------------------ exception handlers
    @app.exception_handler(StarletteHTTPException)
    async def http_exc(request: Request, exc: StarletteHTTPException) -> Response:
        rid = getattr(request.state, "request_id", "unknown")
        path = request.scope["path"]
        if exc.status_code == 405:
            allow = ROUTE_METHODS.get(path) or ("GET" if re.fullmatch(r"/v1/careers/[^/]+", path) else None)
            err: BaseException = ApiError(405, "METHOD_NOT_ALLOWED", f"{request.method} is not allowed on {path}.", allow=allow)
        elif exc.status_code == 404:
            err = ApiError(404, "NOT_FOUND", f"No endpoint at {path}.")
        else:
            err = ApiError(exc.status_code, "HTTP_ERROR", str(exc.detail))
        return _error_response(err, rid)

    @app.exception_handler(ApiError)
    async def api_exc(request: Request, exc: ApiError) -> Response:
        return _error_response(exc, request.state.request_id)

    @app.exception_handler(InputValidationError)
    async def input_exc(request: Request, exc: InputValidationError) -> Response:
        return _error_response(exc, request.state.request_id)

    @app.exception_handler(CareerNotFoundError)
    async def career_exc(request: Request, exc: CareerNotFoundError) -> Response:
        return _error_response(exc, request.state.request_id)

    # ------------------------------------------------------------------ routes
    def cached(body: Any) -> JsonResponse:
        return JsonResponse(body, headers={"Cache-Control": "public, max-age=300"})

    @app.get("/health", include_in_schema=False)
    async def health() -> Response:
        status, body = h.health()
        return JsonResponse(body, status_code=status)

    @app.get("/v1/meta", include_in_schema=False)
    async def meta() -> Response:
        return cached(h.meta())

    @app.get("/v1/options", include_in_schema=False)
    async def options() -> Response:
        return cached(h.options())

    @app.get("/v1/careers", include_in_schema=False)
    async def careers() -> Response:
        return cached(h.careers())

    @app.get("/v1/careers/{career_id}", include_in_schema=False)
    async def career(career_id: str) -> Response:
        return cached(h.career(career_id))

    @app.post("/v1/recommendations", include_in_schema=False)
    async def recommendations(request: Request) -> Response:
        return JsonResponse(h.recommendations(request.state.body))

    @app.post("/v1/roadmaps", include_in_schema=False)
    async def roadmaps(request: Request) -> Response:
        return JsonResponse(h.roadmaps(request.state.body))

    return app


async def _read_json(request: Request, limit: int) -> Any:
    declared = request.headers.get("content-length")
    try:
        if declared is not None and float(declared) > limit:
            raise ApiError(413, "PAYLOAD_TOO_LARGE", f"The request body must be at most {limit} bytes.")
    except ValueError:
        pass
    chunks: list[bytes] = []
    size = 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > limit:
            raise ApiError(413, "PAYLOAD_TOO_LARGE", f"The request body must be at most {limit} bytes.")
        chunks.append(chunk)
    text = b"".join(chunks).decode("utf-8", errors="replace")
    try:
        return json.loads(text, parse_constant=_reject_constant)
    except (ValueError, RecursionError):
        raise ApiError(400, "INVALID_JSON", "The request body is not valid JSON.") from None
