"""ASGI entry point:  uvicorn pathfinder.api.main:app --host 0.0.0.0 --port $PORT"""

from .app import create_app

app = create_app()
