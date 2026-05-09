import json
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from deps import get_user_id, get_supabase

router = APIRouter()

_TEMPLATES_PATH = Path(__file__).resolve().parent.parent / "data" / "templates.json"


def _load_templates():
    with open(_TEMPLATES_PATH, encoding="utf-8") as f:
        return json.load(f)


@router.get("/")
async def list_templates():
    return _load_templates()


@router.get("/{template_id}")
async def get_template(template_id: str):
    tpl = next((t for t in _load_templates() if t["id"] == template_id), None)
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    return tpl


@router.post("/{template_id}/apply")
async def apply_template(
    template_id: str,
    project_id: str,
    user_id: str = Depends(get_user_id),
):
    tpl = next((t for t in _load_templates() if t["id"] == template_id), None)
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")

    supabase = get_supabase()
    res = supabase.table("documents").insert({
        "user_id": user_id,
        "project_id": project_id,
        "title": tpl["name"],
        "content": {
            "type": "doc",
            "content": [{"type": "paragraph", "content": [{"type": "text", "text": tpl["content"]}]}]
        },
    }).execute()
    return res.data[0]
