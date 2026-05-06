from fastapi import APIRouter, Depends
from pydantic import BaseModel
from deps import get_supabase, get_user_id

router = APIRouter()


class ContextUpsert(BaseModel):
    content: str


@router.get("/{project_id}/context")
async def get_context(project_id: str, user_id: str = Depends(get_user_id)):
    supabase = get_supabase()
    result = (
        supabase.table("context_chunks")
        .select("content")
        .eq("project_id", project_id)
        .eq("user_id", user_id)
        .eq("title", "__product_brain__")
        .single()
        .execute()
    )
    return {"content": result.data["content"] if result.data else ""}


@router.put("/{project_id}/context")
async def upsert_context(
    project_id: str, body: ContextUpsert, user_id: str = Depends(get_user_id)
):
    supabase = get_supabase()
    existing = (
        supabase.table("context_chunks")
        .select("id")
        .eq("project_id", project_id)
        .eq("user_id", user_id)
        .eq("title", "__product_brain__")
        .execute()
    )
    if existing.data:
        result = (
            supabase.table("context_chunks")
            .update({"content": body.content})
            .eq("id", existing.data[0]["id"])
            .execute()
        )
    else:
        result = (
            supabase.table("context_chunks")
            .insert({
                "user_id": user_id,
                "project_id": project_id,
                "title": "__product_brain__",
                "content": body.content,
            })
            .execute()
        )
    return result.data[0]
