"""Run the API:  python -m pathfinder.api   (PORT, HOST, KB_DIR, CORS_ALLOWED_ORIGINS, MAX_BODY_BYTES, LOG_REQUESTS)"""

import uvicorn

from .settings import Settings


def main() -> None:
    s = Settings.from_env()
    uvicorn.run("pathfinder.api.main:app", host=s.host, port=s.port, access_log=False, log_level="warning")


if __name__ == "__main__":
    main()
