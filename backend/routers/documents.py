import logging
import os
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from deps import get_supabase, get_user_id
from agent.tools import _tiptap_to_text

logger = logging.getLogger(__name__)
router = APIRouter()


class DocumentUpdate(BaseModel):
    title: str | None = None
    content: dict | None = None


def _chunk_text(text: str, chunk_size: int = 800, overlap: int = 150) -> list[str]:
    chunks = []
    start = 0
    while start < len(text):
        chunks.append(text[start:start + chunk_size])
        start += chunk_size - overlap
    return [c for c in chunks if c.strip()]


def _embed_document_chunks(
    doc_id: str, project_id: str, user_id: str, content: dict
) -> None:
    """Background task: extract text → chunk → embed → upsert document_chunks."""
    try:
        from google import genai
        from google.genai import types as genai_types

        text = _tiptap_to_text(content).strip()
        if not text:
            return

        chunks = _chunk_text(text)
        if not chunks:
            return

        client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY", ""))
        res = client.models.embed_content(
            model="gemini-embedding-2",
            contents=chunks,
            config=genai_types.EmbedContentConfig(output_dimensionality=768),
        )
        emb_list = res.embeddings if hasattr(res, "embeddings") else res

        supabase = get_supabase()
        # Replace existing chunks atomically (delete then insert)
        supabase.table("document_chunks").delete().eq("document_id", doc_id).execute()

        records = []
        for i, emb_obj in enumerate(emb_list):
            vector = emb_obj.values if hasattr(emb_obj, "values") else emb_obj
            records.append({
                "document_id": doc_id,
                "project_id": project_id,
                "user_id": user_id,
                "content": chunks[i],
                "chunk_index": i,
                "embedding": vector,
            })

        if records:
            supabase.table("document_chunks").insert(records).execute()
            logger.info("Embedded doc %s: %d chunks", doc_id, len(records))
    except Exception as e:
        logger.error("Background embedding failed for doc %s: %s", doc_id, e, exc_info=True)


@router.get("/{doc_id}")
async def get_document(doc_id: str, user_id: str = Depends(get_user_id)):
    supabase = get_supabase()
    result = (
        supabase.table("documents")
        .select("*")
        .eq("id", doc_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Document not found")
    return result.data[0]


@router.put("/{doc_id}")
async def update_document(
    doc_id: str,
    doc: DocumentUpdate,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(get_user_id),
):
    supabase = get_supabase()
    update_data = {k: v for k, v in doc.model_dump().items() if v is not None}
    result = (
        supabase.table("documents")
        .update(update_data)
        .eq("id", doc_id)
        .eq("user_id", user_id)
        .execute()
    )
    updated = result.data[0]

    # Trigger embedding only when content changed and project_id is available
    if "content" in update_data and updated.get("project_id"):
        background_tasks.add_task(
            _embed_document_chunks,
            doc_id,
            str(updated["project_id"]),
            user_id,
            updated["content"],
        )

    return updated


@router.delete("/{doc_id}")
async def delete_document(doc_id: str, user_id: str = Depends(get_user_id)):
    supabase = get_supabase()
    supabase.table("documents").delete().eq("id", doc_id).eq("user_id", user_id).execute()
    return {"deleted": True}
