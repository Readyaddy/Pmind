"""Agent entry point — delegates to the multi-agent orchestrator."""
import logging
from typing import AsyncGenerator

from .orchestrator import run_orchestrated

logger = logging.getLogger(__name__)


async def run_agent(
    *,
    messages: list[dict],
    user_id: str,
    project_id: str | None,
    product_context: str = "",
    document_context: str = "",
    mentions_context: str = "",
    pending_decisions: list[dict] | None = None,
    model: str | None = None,
    provider: str | None = None,
    calendar_provider: str = "google",
    max_steps: int = 8,
) -> AsyncGenerator[str, None]:
    async for chunk in run_orchestrated(
        messages=messages,
        user_id=user_id,
        project_id=project_id,
        product_context=product_context,
        document_context=document_context,
        mentions_context=mentions_context,
        pending_decisions=pending_decisions,
        model=model,
        provider=provider,
        calendar_provider=calendar_provider,
        max_steps=max_steps,
    ):
        yield chunk
