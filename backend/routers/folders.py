from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from deps import get_supabase, get_user_id

router = APIRouter()


class FolderUpdate(BaseModel):
    name: str


@router.put("/{folder_id}")
async def rename_folder(
    folder_id: str, body: FolderUpdate, user_id: str = Depends(get_user_id)
):
    supabase = get_supabase()
    result = (
        supabase.table("folders")
        .update({"name": body.name})
        .eq("id", folder_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Folder not found")
    return result.data[0]


@router.delete("/{folder_id}")
async def delete_folder(folder_id: str, user_id: str = Depends(get_user_id)):
    supabase = get_supabase()
    supabase.table("folders").delete().eq("id", folder_id).eq("user_id", user_id).execute()
    return {"deleted": True}
