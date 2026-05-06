from typing import AsyncGenerator
from google import genai
from google.genai import types
from .base import LLMProvider


class GeminiProvider(LLMProvider):
    def __init__(self, api_key: str, model: str = "gemini-2.5-flash"):
        self.client = genai.Client(api_key=api_key)
        self.model = model

    async def complete(
        self, system_prompt: str, user_message: str, stream: bool = True
    ) -> AsyncGenerator[str, None]:
        config = types.GenerateContentConfig(
            system_instruction=system_prompt,
        )
        async for chunk in await self.client.aio.models.generate_content_stream(
            model=self.model,
            contents=user_message,
            config=config,
        ):
            if chunk.text:
                yield chunk.text
