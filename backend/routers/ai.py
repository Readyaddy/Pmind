import json
import logging
import os
import re
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, File, Form, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional
from llm.factory import get_llm_provider
from prompts import get_system_prompt
from deps import get_user_id, get_supabase
from agent.runner import run_agent
from agent.tools import _tiptap_to_text

logger = logging.getLogger(__name__)
router = APIRouter()

FREE_LIMIT = 20  # AI requests per day on free tier


def _check_usage(user_id: str, endpoint: str = "ai"):
    """Raise 429 if free-tier daily limit exceeded. No-op in dev mode or for paid users."""
    if os.getenv("NEXT_PUBLIC_DEV_MODE") == "true":
        return
    supabase = get_supabase()
    try:
        plan_res = supabase.table("user_subscriptions").select("plan").eq("user_id", user_id).execute()
        plan = plan_res.data[0]["plan"] if plan_res.data else "free"
        if plan != "free":
            return
        today = datetime.now(timezone.utc).date().isoformat()
        count_res = (
            supabase.table("usage_logs")
            .select("id", count="exact")
            .eq("user_id", user_id)
            .gte("created_at", today)
            .execute()
        )
        if (count_res.count or 0) >= FREE_LIMIT:
            raise HTTPException(status_code=429, detail="Daily limit reached. Upgrade to Pro.")
        supabase.table("usage_logs").insert({"user_id": user_id, "endpoint": endpoint}).execute()
    except HTTPException:
        raise
    except Exception:
        pass  # Don't block AI if billing tables don't exist yet


# ── Request models ─────────────────────────────────────────────────────────────

class AIRequest(BaseModel):
    command: str
    user_input: str
    product_context: str = ""
    document_context: str = ""
    project_id: Optional[str] = None


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    document_context: str = ""
    project_id: Optional[str] = None
    thread_id: Optional[str] = None


class GenerateTicketsRequest(BaseModel):
    user_input: str
    product_context: str = ""
    document_context: str = ""


class ApplyRequest(BaseModel):
    current_content: str
    ai_suggestion: str


class SearchRequest(BaseModel):
    query: str
    scope: str = "project"
    project_id: Optional[str] = None


class CreateThreadRequest(BaseModel):
    project_id: str
    title: str = "New Chat"


# ── AI endpoints ───────────────────────────────────────────────────────────────

@router.post("/complete")
async def ai_complete(request: AIRequest, user_id: str = Depends(get_user_id)):
    _check_usage(user_id, "complete")
    provider = get_llm_provider()
    system_prompt = get_system_prompt(command=request.command, product_context=request.product_context)
    user_message = (
        f"Current document context:\n{request.document_context or 'Empty document'}\n\n"
        f"User request:\n{request.user_input}"
    )

    async def generate():
        async for chunk in provider.complete(system_prompt, user_message):
            yield f"data: {chunk.replace(chr(10), chr(92) + 'n')}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.post("/generate-tickets")
async def generate_tickets(request: GenerateTicketsRequest, user_id: str = Depends(get_user_id)):
    provider = get_llm_provider()
    system_prompt = """You are an expert Product Manager creating structured Jira/Linear tickets.

Output ONLY valid JSON — no markdown fences, no explanation before or after. Use exactly this structure:
{
  "epics": [
    {
      "title": "Epic title",
      "description": "2-3 sentence epic description",
      "stories": [
        {
          "title": "As a [user], I want [goal] so that [benefit]",
          "description": "Story context and implementation detail",
          "acceptance_criteria": ["Given [context] when [action] then [outcome]"],
          "story_points": 3
        }
      ]
    }
  ]
}

Generate 2-4 epics with 2-5 stories each. Be specific, actionable, and grounded in the product context."""

    user_message = ""
    if request.product_context:
        user_message += f"Product context:\n{request.product_context}\n\n"
    if request.document_context:
        user_message += f"Current document content:\n{request.document_context}\n\n"
    user_message += f"Feature/epic to break down into tickets:\n{request.user_input}"

    full_response = ""
    async for chunk in provider.complete(system_prompt, user_message):
        full_response += chunk

    clean = re.sub(r"```(?:json)?\s*", "", full_response).replace("```", "").strip()
    try:
        return json.loads(clean)
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="AI returned malformed JSON. Please try again.")


# ── Chat thread CRUD ───────────────────────────────────────────────────────────

@router.get("/threads")
async def list_threads(project_id: str, user_id: str = Depends(get_user_id)):
    supabase = get_supabase()
    res = (
        supabase.table("chat_threads")
        .select("*")
        .eq("user_id", user_id)
        .eq("project_id", project_id)
        .order("updated_at", desc=True)
        .execute()
    )
    return res.data or []


@router.post("/threads")
async def create_thread(body: CreateThreadRequest, user_id: str = Depends(get_user_id)):
    supabase = get_supabase()
    res = supabase.table("chat_threads").insert({
        "user_id": user_id,
        "project_id": body.project_id,
        "title": body.title,
    }).execute()
    return res.data[0]


@router.get("/threads/{thread_id}/messages")
async def get_thread_messages(thread_id: str, user_id: str = Depends(get_user_id)):
    supabase = get_supabase()
    res = (
        supabase.table("chat_messages")
        .select("*")
        .eq("thread_id", thread_id)
        .eq("user_id", user_id)
        .order("created_at")
        .execute()
    )
    return res.data or []


@router.delete("/threads/{thread_id}")
async def delete_thread(thread_id: str, user_id: str = Depends(get_user_id)):
    supabase = get_supabase()
    supabase.table("chat_messages").delete().eq("thread_id", thread_id).execute()
    supabase.table("chat_threads").delete().eq("id", thread_id).eq("user_id", user_id).execute()
    return {"ok": True}


# ── Chat ───────────────────────────────────────────────────────────────────────

@router.post("/chat")
async def ai_chat(request: ChatRequest, user_id: str = Depends(get_user_id)):
    _check_usage(user_id, "chat")
    provider = get_llm_provider()
    supabase = get_supabase()
    thread_id = request.thread_id

    # Create a thread automatically on first message
    if not thread_id and request.project_id and request.messages:
        title = request.messages[-1].content[:60]
        try:
            res = supabase.table("chat_threads").insert({
                "user_id": user_id,
                "project_id": request.project_id,
                "title": title,
            }).execute()
            if res.data:
                thread_id = res.data[0]["id"]
        except Exception:
            pass

    # Persist user message
    if thread_id and request.messages:
        try:
            last_msg = request.messages[-1]
            supabase.table("chat_messages").insert({
                "thread_id": thread_id,
                "user_id": user_id,
                "role": last_msg.role,
                "content": last_msg.content,
            }).execute()
        except Exception:
            pass

    # RAG lookup
    rag_context = ""
    if request.project_id and request.messages:
        try:
            from google import genai
            from google.genai import types
            client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY", ""))
            emb = client.models.embed_content(
                model="gemini-embedding-2",
                contents=request.messages[-1].content,
                config=types.EmbedContentConfig(output_dimensionality=768),
            )
            vector = emb.embeddings[0].values if hasattr(emb, "embeddings") else emb[0]
            result = supabase.rpc("match_knowledge_chunks", {
                "query_embedding": vector,
                "match_threshold": 0.5,
                "match_count": 5,
                "p_project_id": request.project_id,
            }).execute()
            if result.data:
                rag_context = "\n\nRelevant Knowledge Base Context:\n"
                for idx, row in enumerate(result.data):
                    rag_context += f"--- Excerpt {idx + 1} ---\n{row['content']}\n"
        except Exception as e:
            logger.error("RAG context fetch failed: %s", e, exc_info=True)

    system_prompt = (
        "You are PM Cursor, an expert AI Product Manager assistant.\n"
        "Help the user build great products. You have access to their current document content.\n"
        "Be concise, practical, and focus on product management best practices."
        + rag_context
    )

    conversation = f"Current document context:\n{request.document_context or 'Empty document'}\n\n"
    for msg in request.messages:
        role = "User" if msg.role == "user" else "Assistant"
        conversation += f"{role}: {msg.content}\n\n"
    conversation += "Assistant:"

    full_response: list[str] = []

    async def generate():
        async for chunk in provider.complete(system_prompt, conversation):
            full_response.append(chunk)
            yield f"data: {chunk.replace(chr(10), chr(92) + 'n')}\n\n"

        # Persist assistant reply
        if thread_id:
            try:
                supabase.table("chat_messages").insert({
                    "thread_id": thread_id,
                    "user_id": user_id,
                    "role": "assistant",
                    "content": "".join(full_response),
                }).execute()
                supabase.table("chat_threads").update({
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }).eq("id", thread_id).execute()
            except Exception:
                pass

        yield "data: [DONE]\n\n"

    headers = {"X-Thread-Id": thread_id or ""}
    return StreamingResponse(generate(), media_type="text/event-stream", headers=headers)


# ── Apply ──────────────────────────────────────────────────────────────────────


@router.post("/apply")
async def ai_apply(request: ApplyRequest, user_id: str = Depends(get_user_id)):
    provider = get_llm_provider()
    prompt = f"""CURRENT DOCUMENT:
{request.current_content}

AI SUGGESTION:
{request.ai_suggestion}

Return ONLY valid JSON with no markdown fences:
{{"changes": [{{"find": "exact verbatim text from the current document", "replace": "new text to substitute in"}}]}}

Rules:
- "find" must be verbatim text that exists in the current document
- Use the minimum number of changes needed
- If adding new content, set "find" to the sentence just before the insertion point and "replace" to that sentence plus the new content appended after it
- Maximum 10 changes"""

    result = ""
    async for chunk in provider.complete(
        "You are a precise document editor. Output only valid JSON, no markdown.", prompt
    ):
        result += chunk

    clean = re.sub(r"```(?:json)?\s*", "", result).replace("```", "").strip()
    try:
        return json.loads(clean)
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="AI returned malformed JSON for apply.")


# ── Search ─────────────────────────────────────────────────────────────────────

@router.post("/search")
async def ai_search(request: SearchRequest, user_id: str = Depends(get_user_id)):
    supabase = get_supabase()
    results = []

    # Vector search on knowledge chunks
    try:
        from google import genai
        from google.genai import types
        client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY", ""))
        emb = client.models.embed_content(
            model="gemini-embedding-2",
            contents=request.query,
            config=types.EmbedContentConfig(output_dimensionality=768),
        )
        vector = emb.embeddings[0].values if hasattr(emb, "embeddings") else emb[0]

        if request.scope == "project" and request.project_id:
            rpc_res = supabase.rpc("match_knowledge_chunks", {
                "query_embedding": vector,
                "match_threshold": 0.4,
                "match_count": 10,
                "p_project_id": request.project_id,
            }).execute()
        else:
            rpc_res = supabase.rpc("match_all_knowledge_chunks", {
                "query_embedding": vector,
                "match_threshold": 0.4,
                "match_count": 10,
                "p_user_id": user_id,
            }).execute()

        for row in rpc_res.data or []:
            results.append({
                "type": "knowledge",
                "id": str(row["id"]),
                "knowledge_document_id": str(row.get("knowledge_document_id", "")),
                "project_id": str(row.get("project_id", "")),
                "content": row["content"][:300],
                "similarity": row["similarity"],
            })
    except Exception as e:
        logger.error("Search embedding failed: %s", e, exc_info=True)

    # Full-text search on documents
    try:
        query_like = f"%{request.query}%"
        if request.scope == "project" and request.project_id:
            doc_res = (
                supabase.table("documents")
                .select("id, title, project_id")
                .eq("project_id", request.project_id)
                .eq("user_id", user_id)
                .limit(5)
                .execute()
            )
        else:
            doc_res = (
                supabase.table("documents")
                .select("id, title, project_id")
                .eq("user_id", user_id)
                .limit(5)
                .execute()
            )
        for doc in doc_res.data or []:
            results.append({
                "type": "document",
                "id": str(doc["id"]),
                "title": doc.get("title", "Untitled"),
                "project_id": str(doc.get("project_id", "")),
                "content": doc.get("title", "")[:300],
                "similarity": 0.5,
            })
    except Exception as e:
        logger.error("Doc search failed: %s", e, exc_info=True)

    results.sort(key=lambda x: x["similarity"], reverse=True)
    return {"results": results[:10]}


# ── Multimodal UI review ───────────────────────────────────────────────────────

@router.post("/review-ui")
async def review_ui(
    image: UploadFile = File(...),
    prompt: str = Form(...),
    document_context: str = Form(""),
    model_override: Optional[str] = Form(None),
    user_id: str = Depends(get_user_id),
):
    import base64
    _check_usage(user_id, "review-ui")
    image_bytes = await image.read()
    image_b64 = base64.b64encode(image_bytes).decode()

    from google import genai as g
    client = g.Client(api_key=os.getenv("GOOGLE_API_KEY", ""))
    vision_model = model_override or os.getenv("LLM_MODEL", "gemini-2.5-flash")

    async def generate():
        for chunk in client.models.generate_content_stream(
            model=vision_model,
            contents=[{"role": "user", "parts": [
                {"inline_data": {"mime_type": image.content_type, "data": image_b64}},
                {"text": (
                    f"Analyze this UI screenshot for a Product Manager.\n\n"
                    f"Request: {prompt}\n\n"
                    f"Document context: {document_context}"
                )},
            ]}],
        ):
            if chunk.text:
                yield f"data: {chunk.text.replace(chr(10), chr(92) + 'n')}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


# ── Agent ──────────────────────────────────────────────────────────────────────

FREE_PROVIDER = "gemini"
FREE_MODEL = "gemini-2.5-flash"


class PendingDecision(BaseModel):
    tool_call_id: str
    decision: str  # "approve" | "deny"
    reason: Optional[str] = None


PRO_MODELS = [
    {"id": "gemini-2.5-flash-lite",    "label": "2.5 Flash Lite",    "description": "Fastest & most affordable"},
    {"id": "gemini-2.5-flash",         "label": "2.5 Flash",          "description": "Fast & balanced (default)"},
    {"id": "gemini-2.5-pro",           "label": "2.5 Pro",            "description": "Most capable, best reasoning"},
    {"id": "gemini-3-flash-preview",   "label": "3 Flash Preview",    "description": "Gemini 3 Flash (preview)"},
    {"id": "gemini-3.1-pro-preview",   "label": "3.1 Pro Preview",    "description": "Most powerful — Gemini 3.1 Pro (preview)"},
]


class AgentRequest(BaseModel):
    messages: list
    project_id: Optional[str] = None
    thread_id: Optional[str] = None
    product_context: str = ""
    document_context: str = ""
    pending_decisions: Optional[List[PendingDecision]] = None
    mentioned_doc_ids: Optional[List[str]] = None
    mentioned_kb_ids: Optional[List[str]] = None
    model_override: Optional[str] = None


def _get_plan(user_id: str) -> str:
    if os.getenv("NEXT_PUBLIC_DEV_MODE") == "true":
        return "pro"
    try:
        from datetime import datetime, timezone
        supabase = get_supabase()
        res = supabase.table("user_subscriptions") \
            .select("plan, status, current_period_end") \
            .eq("user_id", user_id).execute()
        if not res.data:
            return "free"
        row = res.data[0]
        plan = row.get("plan", "free")
        if plan == "free":
            return "free"
        # Enforce expiry: if current_period_end is set and in the past, downgrade
        period_end_str = row.get("current_period_end")
        if period_end_str:
            period_end = datetime.fromisoformat(period_end_str.replace("Z", "+00:00"))
            if datetime.now(timezone.utc) > period_end:
                # Subscription expired — downgrade in DB and return free
                logger.info("Subscription expired — user=%s plan=%s period_end=%s", user_id, plan, period_end_str)
                supabase.table("user_subscriptions").update({
                    "plan": "free",
                    "status": "cancelled",
                }).eq("user_id", user_id).execute()
                return "free"
        return plan
    except Exception:
        return "free"


def _resolve_llm(user_id: str, model_override: Optional[str] = None) -> tuple:
    """Return (provider, model). Free users are locked to Gemini Flash.
    Pro users may pick any model from PRO_MODELS via model_override."""
    plan = _get_plan(user_id)
    if plan == "free":
        logger.debug("LLM resolve — user=%s plan=free model=%s", user_id, FREE_MODEL)
        return FREE_PROVIDER, FREE_MODEL
    provider = os.getenv("LLM_PROVIDER", FREE_PROVIDER)
    valid_ids = {m["id"] for m in PRO_MODELS}
    if model_override and model_override in valid_ids:
        logger.info("LLM resolve — user=%s plan=%s model=%s (override)", user_id, plan, model_override)
        return provider, model_override
    model = os.getenv("LLM_MODEL", FREE_MODEL)
    logger.debug("LLM resolve — user=%s plan=%s model=%s (default)", user_id, plan, model)
    return provider, model


@router.get("/agent/info")
async def agent_info(user_id: str = Depends(get_user_id)):
    plan = _get_plan(user_id)
    provider, model = _resolve_llm(user_id)
    return {
        "plan": plan,
        "provider": provider,
        "model": model,
        "locked": plan == "free",
        "pro_models": PRO_MODELS,
    }


@router.post("/agent")
async def ai_agent(
    request: AgentRequest,
    user_id: str = Depends(get_user_id),
):
    supabase = get_supabase()
    provider, model = _resolve_llm(user_id, request.model_override)
    is_resume = bool(request.pending_decisions)

    # Thread + message persistence
    thread_id = request.thread_id
    if not thread_id and request.project_id and request.messages:
        first_user = next(
            (m for m in request.messages if isinstance(m, dict) and m.get("role") == "user"),
            None,
        )
        title = ""
        if first_user:
            content = first_user.get("content") or ""
            title = content[:60] if isinstance(content, str) else "New chat"
        try:
            res = supabase.table("chat_threads").insert({
                "user_id": user_id,
                "project_id": request.project_id,
                "title": title or "New chat",
            }).execute()
            if res.data:
                thread_id = res.data[0]["id"]
        except Exception:
            pass

    if not is_resume and thread_id and request.messages:
        user_msgs = [
            m for m in request.messages
            if isinstance(m, dict) and m.get("role") == "user"
        ]
        if user_msgs:
            last_user = user_msgs[-1]
            try:
                supabase.table("chat_messages").insert({
                    "thread_id": thread_id,
                    "user_id": user_id,
                    "role": "user",
                    "content": last_user.get("content") or "",
                }).execute()
            except Exception:
                pass

    # Pre-load @-mentioned files into document_context
    doc_ctx = request.document_context or ""
    try:
        if request.mentioned_doc_ids:
            for doc_id in request.mentioned_doc_ids:
                res = supabase.table("documents").select("title, content").eq("id", doc_id).eq("user_id", user_id).execute()
                if res.data:
                    row = res.data[0]
                    text = _tiptap_to_text(row.get("content") or {})
                    doc_ctx += f"\n\n--- @{row.get('title', 'doc')} ---\n{text[:3000]}"
        if request.mentioned_kb_ids:
            for kb_id in request.mentioned_kb_ids:
                res = supabase.table("knowledge_chunks").select("content").eq("knowledge_document_id", kb_id).eq("user_id", user_id).limit(5).execute()
                if res.data:
                    combined = "\n".join(r["content"] for r in res.data)
                    doc_ctx += f"\n\n--- @KB:{kb_id} ---\n{combined[:3000]}"
    except Exception:
        pass

    pending = [d.model_dump() for d in (request.pending_decisions or [])]

    async def generate():
        final_text_parts: list = []
        try:
            async for sse_chunk in run_agent(
                messages=request.messages,
                user_id=user_id,
                project_id=request.project_id,
                product_context=request.product_context,
                document_context=doc_ctx,
                pending_decisions=pending or None,
                model=model,
                provider=provider,
            ):
                try:
                    if sse_chunk.startswith("event: text"):
                        data_line = [l for l in sse_chunk.split("\n") if l.startswith("data: ")]
                        if data_line:
                            payload = json.loads(data_line[0][6:])
                            final_text_parts.append(payload.get("delta", ""))
                    elif sse_chunk.startswith("event: done"):
                        final_text = "".join(final_text_parts)
                        if thread_id and final_text.strip():
                            try:
                                if is_resume:
                                    existing = (
                                        supabase.table("chat_messages")
                                        .select("id")
                                        .eq("thread_id", thread_id)
                                        .eq("role", "assistant")
                                        .order("created_at", desc=True)
                                        .limit(1)
                                        .execute()
                                    )
                                    if existing.data:
                                        supabase.table("chat_messages").update({
                                            "content": final_text,
                                        }).eq("id", existing.data[0]["id"]).execute()
                                    else:
                                        supabase.table("chat_messages").insert({
                                            "thread_id": thread_id,
                                            "user_id": user_id,
                                            "role": "assistant",
                                            "content": final_text,
                                        }).execute()
                                else:
                                    supabase.table("chat_messages").insert({
                                        "thread_id": thread_id,
                                        "user_id": user_id,
                                        "role": "assistant",
                                        "content": final_text,
                                    }).execute()
                                supabase.table("chat_threads").update({
                                    "updated_at": datetime.now(timezone.utc).isoformat()
                                }).eq("id", thread_id).execute()
                            except Exception:
                                pass
                except Exception:
                    pass
                yield sse_chunk
        except Exception as e:
            logger.error("Agent stream error: %s", e, exc_info=True)
            yield f"event: error\ndata: {json.dumps({'message': str(e)})}\n\n"
            yield f"event: done\ndata: {json.dumps({'final_text': ''})}\n\n"

    headers = {
        "X-Thread-Id": thread_id or "",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
    }
    return StreamingResponse(generate(), media_type="text/event-stream", headers=headers)
