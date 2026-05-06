import os
from .base import LLMProvider
from .gemini import GeminiProvider
from .claude import ClaudeProvider
from .openai_provider import OpenAIProvider


def get_llm_provider(model_override: str | None = None) -> LLMProvider:
    provider = os.getenv("LLM_PROVIDER", "gemini").lower()
    model = model_override or os.getenv("LLM_MODEL")

    if provider == "gemini":
        return GeminiProvider(
            api_key=os.getenv("GOOGLE_API_KEY", ""),
            model=model or "gemini-2.5-flash",
        )
    elif provider == "claude":
        return ClaudeProvider(
            api_key=os.getenv("ANTHROPIC_API_KEY", ""),
            model=model or "claude-sonnet-4-6",
        )
    elif provider == "openai":
        return OpenAIProvider(
            api_key=os.getenv("OPENAI_API_KEY", ""),
            model=model or "gpt-4o",
        )
    else:
        raise ValueError(f"Unknown LLM_PROVIDER: {provider}. Use gemini | claude | openai")
