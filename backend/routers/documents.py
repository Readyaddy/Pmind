from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from deps import get_supabase, get_user_id

router = APIRouter()


class DocumentUpdate(BaseModel):
    title: str | None = None
    content: dict | None = None


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
    doc_id: str, doc: DocumentUpdate, user_id: str = Depends(get_user_id)
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
    return result.data[0]


@router.delete("/{doc_id}")
async def delete_document(doc_id: str, user_id: str = Depends(get_user_id)):
    supabase = get_supabase()
    supabase.table("documents").delete().eq("id", doc_id).eq("user_id", user_id).execute()
    return {"deleted": True}
