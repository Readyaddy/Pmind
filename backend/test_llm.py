"""
Quick smoke-test for the LLM provider.
Run from the backend/ directory:

    python test_llm.py
    python test_llm.py gemini-2.5-pro
    python test_llm.py gemini-3-flash-preview
"""
import asyncio
import os
import sys
from dotenv import load_dotenv

load_dotenv()


async def test(model: str | None = None):
    from llm.factory import get_llm_provider

    provider_name = os.getenv("LLM_PROVIDER", "gemini")
    model_name = model or os.getenv("LLM_MODEL", "gemini-2.5-flash")
    api_key = os.getenv("GOOGLE_API_KEY", "")

    print(f"\n{'='*55}")
    print(f"  Provider : {provider_name}")
    print(f"  Model    : {model_name}")
    print(f"  API key  : {api_key[:8]}...{api_key[-4:] if len(api_key) > 12 else '(not set)'}")
    print(f"{'='*55}\n")

    if not api_key or api_key == "your_api_key_here":
        print("ERROR: GOOGLE_API_KEY not set in .env")
        return

    try:
        llm = get_llm_provider(model_override=model_name)
    except Exception as e:
        print(f"ERROR: Could not initialise provider — {e}")
        return

    print("Sending: 'Say hello in exactly 5 words.'\n")
    print("Response: ", end="", flush=True)
    try:
        async for chunk in llm.complete("You are a helpful assistant.", "Say hello in exactly 5 words."):
            print(chunk, end="", flush=True)
        print("\n\nOK — streaming works.\n")
    except Exception as e:
        print(f"\n\nERROR during streaming: {e}\n")


if __name__ == "__main__":
    model_arg = sys.argv[1] if len(sys.argv) > 1 else None
    asyncio.run(test(model_arg))
