from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from deps import get_supabase, get_user_id

router = APIRouter()


class ProjectCreate(BaseModel):
    name: str = "Untitled Project"
    color: str = "#D97706"


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    color: str | None = None


class FolderCreate(BaseModel):
    name: str = "New Folder"
    parent_folder_id: str | None = None


class DocumentCreate(BaseModel):
    folder_id: str | None = None


class DesignCreate(BaseModel):
    title: str = "Untitled Design"
    html: str = ""
    css: str = ""
    js: str = ""
    framework: str = "vanilla"


@router.get("/")
async def list_projects(user_id: str = Depends(get_user_id)):
    supabase = get_supabase()
    result = (
        supabase.table("projects")
        .select("id, name, color, description, updated_at")
        .eq("user_id", user_id)
        .order("updated_at", desc=True)
        .execute()
    )
    return result.data


@router.post("/")
async def create_project(project: ProjectCreate, user_id: str = Depends(get_user_id)):
    supabase = get_supabase()
    result = (
        supabase.table("projects")
        .insert({"user_id": user_id, "name": project.name, "color": project.color})
        .execute()
    )
    return result.data[0]


@router.get("/{project_id}")
async def get_project(project_id: str, user_id: str = Depends(get_user_id)):
    supabase = get_supabase()
    result = (
        supabase.table("projects")
        .select("*")
        .eq("id", project_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Project not found")
    return result.data


@router.put("/{project_id}")
async def update_project(
    project_id: str, project: ProjectUpdate, user_id: str = Depends(get_user_id)
):
    supabase = get_supabase()
    update_data = {k: v for k, v in project.model_dump().items() if v is not None}
    result = (
        supabase.table("projects")
        .update(update_data)
        .eq("id", project_id)
        .eq("user_id", user_id)
        .execute()
    )
    return result.data[0]


@router.delete("/{project_id}")
async def delete_project(project_id: str, user_id: str = Depends(get_user_id)):
    supabase = get_supabase()
    supabase.table("projects").delete().eq("id", project_id).eq("user_id", user_id).execute()
    return {"deleted": True}


@router.get("/{project_id}/documents/")
async def list_project_documents(project_id: str, user_id: str = Depends(get_user_id)):
    supabase = get_supabase()
    result = (
        supabase.table("documents")
        .select("id, title, folder_id, updated_at")
        .eq("project_id", project_id)
        .eq("user_id", user_id)
        .order("updated_at", desc=True)
        .execute()
    )
    return result.data


def _unique_title(supabase, user_id: str, project_id: str, base_title: str) -> str:
    """Return base_title if unused, otherwise base_title_1, base_title_2, …"""
    existing = (
        supabase.table("documents")
        .select("title")
        .eq("project_id", project_id)
        .eq("user_id", user_id)
        .execute()
    )
    titles = {r["title"] for r in (existing.data or [])}
    if base_title not in titles:
        return base_title
    i = 1
    while f"{base_title}_{i}" in titles:
        i += 1
    return f"{base_title}_{i}"


@router.post("/{project_id}/documents/")
async def create_project_document(
    project_id: str,
    body: DocumentCreate = DocumentCreate(),
    user_id: str = Depends(get_user_id),
):
    supabase = get_supabase()
    title = _unique_title(supabase, user_id, project_id, "Untitled")
    result = (
        supabase.table("documents")
        .insert({
            "user_id": user_id,
            "project_id": project_id,
            "folder_id": body.folder_id,
            "title": title,
            "content": {},
        })
        .execute()
    )
    return result.data[0]


@router.get("/{project_id}/tree")
async def get_project_tree(project_id: str, user_id: str = Depends(get_user_id)):
    supabase = get_supabase()
    folders_result = (
        supabase.table("folders")
        .select("id, name, parent_folder_id")
        .eq("project_id", project_id)
        .eq("user_id", user_id)
        .execute()
    )
    docs_result = (
        supabase.table("documents")
        .select("id, title, folder_id, updated_at")
        .eq("project_id", project_id)
        .eq("user_id", user_id)
        .order("updated_at", desc=True)
        .limit(200)
        .execute()
    )
    return {"folders": folders_result.data, "docs": docs_result.data}


@router.post("/{project_id}/designs/")
async def save_design(
    project_id: str,
    body: DesignCreate,
    user_id: str = Depends(get_user_id),
):
    supabase = get_supabase()

    # Find or create the "Designs" folder for this project
    folder_result = (
        supabase.table("folders")
        .select("id")
        .eq("project_id", project_id)
        .eq("user_id", user_id)
        .eq("name", "Designs")
        .is_("parent_folder_id", None)
        .execute()
    )
    if folder_result.data:
        folder_id = folder_result.data[0]["id"]
    else:
        new_folder = (
            supabase.table("folders")
            .insert({
                "user_id": user_id,
                "project_id": project_id,
                "name": "Designs",
                "parent_folder_id": None,
            })
            .execute()
        )
        folder_id = new_folder.data[0]["id"]

    doc_result = (
        supabase.table("documents")
        .insert({
            "user_id": user_id,
            "project_id": project_id,
            "folder_id": folder_id,
            "title": body.title,
            "content": {
                "_type": "design",
                "html": body.html,
                "css": body.css,
                "js": body.js,
                "framework": body.framework,
            },
        })
        .execute()
    )
    return {"doc_id": doc_result.data[0]["id"], "folder_id": folder_id}


@router.post("/{project_id}/folders/")
async def create_folder(
    project_id: str, folder: FolderCreate, user_id: str = Depends(get_user_id)
):
    supabase = get_supabase()
    result = (
        supabase.table("folders")
        .insert({
            "user_id": user_id,
            "project_id": project_id,
            "name": folder.name,
            "parent_folder_id": folder.parent_folder_id,
        })
        .execute()
    )
    return result.data[0]
