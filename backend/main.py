from dotenv import load_dotenv
load_dotenv()

import logging
import os
import time
from logging_config import configure_logging
configure_logging(os.getenv("LOG_LEVEL", "INFO"))

logger = logging.getLogger(__name__)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.types import ASGIApp, Receive, Scope, Send
from routers import ai, documents, projects, folders, knowledge, integrations, context, billing, templates


class LoggingMiddleware:
    """Pure ASGI middleware — wraps send() so it never buffers streaming/SSE bodies."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        start = time.perf_counter()
        method = scope.get("method", "")
        path = scope.get("path", "")
        status_code = 0

        async def send_wrapper(message: dict) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
            await send(message)

        await self.app(scope, receive, send_wrapper)
        ms = (time.perf_counter() - start) * 1000
        logger.info("%s %s %d %.0fms", method, path, status_code, ms)


app = FastAPI(title="PM Cursor API")
app.add_middleware(LoggingMiddleware)

ALLOWED_ORIGINS = [
    # Local development
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:8000",
    # Production — Vercel
    "https://pmind.vercel.app",
    # Production — custom domain
    "https://pmind.xyz",
    "https://www.pmind.xyz",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Thread-Id"],
)

app.include_router(projects.router, prefix="/projects", tags=["Projects"])
app.include_router(documents.router, prefix="/documents", tags=["Documents"])
app.include_router(folders.router, prefix="/folders", tags=["Folders"])
app.include_router(ai.router, prefix="/ai", tags=["AI"])
app.include_router(knowledge.router, prefix="/knowledge", tags=["Knowledge"])
app.include_router(integrations.router, prefix="/integrations", tags=["Integrations"])
app.include_router(context.router, prefix="/context", tags=["Context"])
app.include_router(billing.router, prefix="/billing", tags=["Billing"])
app.include_router(templates.router, prefix="/templates", tags=["Templates"])


@app.on_event("startup")
async def on_startup():
    provider = os.getenv("LLM_PROVIDER", "gemini")
    model = os.getenv("LLM_MODEL", "gemini-2.5-flash")
    dev_mode = os.getenv("NEXT_PUBLIC_DEV_MODE") == "true"
    logger.info("PMind backend starting — provider=%s model=%s dev_mode=%s", provider, model, dev_mode)


@app.get("/health")
def health():
    return {"status": "ok"}
