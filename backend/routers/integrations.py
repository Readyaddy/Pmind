from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any
import httpx
from deps import get_supabase, get_user_id

router = APIRouter()


# ── Models ────────────────────────────────────────────────────────────────────

class JiraConfig(BaseModel):
    domain: str      # e.g. "company.atlassian.net"
    email: str
    api_token: str


class LinearConfig(BaseModel):
    api_key: str


class ExportToJiraRequest(BaseModel):
    project_key: str
    tickets: List[Dict[str, Any]]    # list of epics with nested stories


class ExportToLinearRequest(BaseModel):
    team_id: str
    tickets: List[Dict[str, Any]]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _adf(text: str) -> dict:
    """Convert plain text to Atlassian Document Format (ADF) required by Jira API v3."""
    paragraphs = []
    for line in (text or "").split("\n"):
        paragraphs.append({
            "type": "paragraph",
            "content": [{"type": "text", "text": line if line.strip() else " "}],
        })
    return {"type": "doc", "version": 1, "content": paragraphs or [{"type": "paragraph", "content": [{"type": "text", "text": " "}]}]}


async def _get_jira_config(user_id: str, supabase) -> dict:
    result = (
        supabase.table("user_integrations")
        .select("config")
        .eq("user_id", user_id)
        .eq("integration_type", "jira")
        .eq("is_active", True)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=400, detail="Jira not connected. Go to Project Settings to connect.")
    return result.data[0]["config"]


async def _get_linear_config(user_id: str, supabase) -> dict:
    result = (
        supabase.table("user_integrations")
        .select("config")
        .eq("user_id", user_id)
        .eq("integration_type", "linear")
        .eq("is_active", True)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=400, detail="Linear not connected. Go to Project Settings to connect.")
    return result.data[0]["config"]


# ── Status ────────────────────────────────────────────────────────────────────

@router.get("/status")
async def get_integrations_status(
    user_id: str = Depends(get_user_id),
    supabase=Depends(get_supabase),
):
    try:
        result = (
            supabase.table("user_integrations")
            .select("integration_type, is_active, config")
            .eq("user_id", user_id)
            .execute()
        )
    except Exception:
        return {"jira": {"connected": False}, "linear": {"connected": False}}

    status: dict = {"jira": {"connected": False}, "linear": {"connected": False}}
    for row in result.data:
        if row["integration_type"] == "jira" and row["is_active"]:
            cfg = row["config"]
            status["jira"] = {
                "connected": True,
                "domain": cfg.get("domain"),
                "email": cfg.get("email"),
            }
        elif row["integration_type"] == "linear" and row["is_active"]:
            status["linear"] = {"connected": True}
    return status


# ── Jira ──────────────────────────────────────────────────────────────────────

@router.post("/jira")
async def connect_jira(
    config: JiraConfig,
    user_id: str = Depends(get_user_id),
    supabase=Depends(get_supabase),
):
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(
            f"https://{config.domain}/rest/api/3/myself",
            auth=(config.email, config.api_token),
            headers={"Accept": "application/json"},
        )
    if res.status_code != 200:
        raise HTTPException(status_code=400, detail="Invalid Jira credentials — check domain, email, and API token.")

    existing = (
        supabase.table("user_integrations")
        .select("id")
        .eq("user_id", user_id)
        .eq("integration_type", "jira")
        .execute()
    )
    row = {
        "user_id": user_id,
        "integration_type": "jira",
        "config": {"domain": config.domain, "email": config.email, "api_token": config.api_token},
        "is_active": True,
    }
    if existing.data:
        supabase.table("user_integrations").update(row).eq("id", existing.data[0]["id"]).execute()
    else:
        supabase.table("user_integrations").insert(row).execute()

    return {"success": True}


@router.delete("/jira")
async def disconnect_jira(
    user_id: str = Depends(get_user_id),
    supabase=Depends(get_supabase),
):
    supabase.table("user_integrations").update({"is_active": False}).eq("user_id", user_id).eq("integration_type", "jira").execute()
    return {"success": True}


@router.get("/jira/projects")
async def list_jira_projects(
    user_id: str = Depends(get_user_id),
    supabase=Depends(get_supabase),
):
    config = await _get_jira_config(user_id, supabase)
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(
            f"https://{config['domain']}/rest/api/3/project/search?maxResults=50&orderBy=name",
            auth=(config["email"], config["api_token"]),
            headers={"Accept": "application/json"},
        )
    if res.status_code != 200:
        raise HTTPException(status_code=400, detail="Failed to fetch Jira projects.")
    return [{"key": p["key"], "name": p["name"], "id": p["id"]} for p in res.json().get("values", [])]


@router.post("/jira/export")
async def export_to_jira(
    request: ExportToJiraRequest,
    user_id: str = Depends(get_user_id),
    supabase=Depends(get_supabase),
):
    config = await _get_jira_config(user_id, supabase)
    base_url = f"https://{config['domain']}/rest/api/3/issue"
    auth = (config["email"], config["api_token"])
    hdrs = {"Content-Type": "application/json", "Accept": "application/json"}
    created = []

    async with httpx.AsyncClient(timeout=30) as client:
        for epic_data in request.tickets:
            epic_payload = {
                "fields": {
                    "project": {"key": request.project_key},
                    "summary": epic_data["title"],
                    "description": _adf(epic_data.get("description", "")),
                    "issuetype": {"name": "Epic"},
                }
            }
            epic_res = await client.post(base_url, json=epic_payload, auth=auth, headers=hdrs)
            if epic_res.status_code not in (200, 201):
                raise HTTPException(
                    status_code=400,
                    detail=f"Failed to create epic '{epic_data['title']}': {epic_res.text}",
                )
            epic_key = epic_res.json()["key"]
            created.append({
                "type": "Epic",
                "key": epic_key,
                "title": epic_data["title"],
                "url": f"https://{config['domain']}/browse/{epic_key}",
            })

            for story in epic_data.get("stories", []):
                ac = story.get("acceptance_criteria", [])
                desc = story.get("description", "")
                if ac:
                    desc += "\n\nAcceptance Criteria:\n" + "\n".join(f"• {a}" for a in ac)

                story_payload = {
                    "fields": {
                        "project": {"key": request.project_key},
                        "summary": story["title"],
                        "description": _adf(desc),
                        "issuetype": {"name": "Story"},
                        "customfield_10014": epic_key,   # Epic Link (standard Jira field)
                    }
                }
                story_res = await client.post(base_url, json=story_payload, auth=auth, headers=hdrs)
                if story_res.status_code in (200, 201):
                    s_key = story_res.json()["key"]
                    created.append({
                        "type": "Story",
                        "key": s_key,
                        "title": story["title"],
                        "epic": epic_key,
                        "url": f"https://{config['domain']}/browse/{s_key}",
                    })

    return {"success": True, "created": created, "domain": config["domain"]}


# ── Linear ────────────────────────────────────────────────────────────────────

@router.post("/linear")
async def connect_linear(
    config: LinearConfig,
    user_id: str = Depends(get_user_id),
    supabase=Depends(get_supabase),
):
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.post(
            "https://api.linear.app/graphql",
            json={"query": "{ viewer { id name } }"},
            headers={"Authorization": config.api_key, "Content-Type": "application/json"},
        )
    body = res.json()
    if res.status_code != 200 or "errors" in body:
        raise HTTPException(status_code=400, detail="Invalid Linear API key.")

    existing = (
        supabase.table("user_integrations")
        .select("id")
        .eq("user_id", user_id)
        .eq("integration_type", "linear")
        .execute()
    )
    row = {
        "user_id": user_id,
        "integration_type": "linear",
        "config": {"api_key": config.api_key},
        "is_active": True,
    }
    if existing.data:
        supabase.table("user_integrations").update(row).eq("id", existing.data[0]["id"]).execute()
    else:
        supabase.table("user_integrations").insert(row).execute()

    return {"success": True}


@router.delete("/linear")
async def disconnect_linear(
    user_id: str = Depends(get_user_id),
    supabase=Depends(get_supabase),
):
    supabase.table("user_integrations").update({"is_active": False}).eq("user_id", user_id).eq("integration_type", "linear").execute()
    return {"success": True}


@router.get("/linear/teams")
async def list_linear_teams(
    user_id: str = Depends(get_user_id),
    supabase=Depends(get_supabase),
):
    config = await _get_linear_config(user_id, supabase)
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.post(
            "https://api.linear.app/graphql",
            json={"query": "{ teams { nodes { id name key } } }"},
            headers={"Authorization": config["api_key"], "Content-Type": "application/json"},
        )
    if res.status_code != 200:
        raise HTTPException(status_code=400, detail="Failed to fetch Linear teams.")
    return res.json().get("data", {}).get("teams", {}).get("nodes", [])


@router.post("/linear/export")
async def export_to_linear(
    request: ExportToLinearRequest,
    user_id: str = Depends(get_user_id),
    supabase=Depends(get_supabase),
):
    config = await _get_linear_config(user_id, supabase)
    api_key = config["api_key"]
    gql = "https://api.linear.app/graphql"
    mutation = """
    mutation CreateIssue($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue { id identifier title url }
      }
    }
    """
    created = []

    async with httpx.AsyncClient(timeout=30) as client:
        for epic_data in request.tickets:
            epic_res = await client.post(
                gql,
                json={"query": mutation, "variables": {"input": {
                    "teamId": request.team_id,
                    "title": epic_data["title"],
                    "description": epic_data.get("description", ""),
                }}},
                headers={"Authorization": api_key, "Content-Type": "application/json"},
            )
            epic_issue = epic_res.json().get("data", {}).get("issueCreate", {}).get("issue")
            if not epic_issue:
                raise HTTPException(status_code=400, detail=f"Failed to create epic '{epic_data['title']}'")

            created.append({
                "type": "Epic",
                "id": epic_issue["id"],
                "identifier": epic_issue.get("identifier"),
                "title": epic_data["title"],
                "url": epic_issue.get("url"),
            })

            for story in epic_data.get("stories", []):
                ac = story.get("acceptance_criteria", [])
                desc = story.get("description", "")
                if ac:
                    desc += "\n\n**Acceptance Criteria:**\n" + "\n".join(f"- {a}" for a in ac)

                story_res = await client.post(
                    gql,
                    json={"query": mutation, "variables": {"input": {
                        "teamId": request.team_id,
                        "title": story["title"],
                        "description": desc,
                        "parentId": epic_issue["id"],
                    }}},
                    headers={"Authorization": api_key, "Content-Type": "application/json"},
                )
                s_issue = story_res.json().get("data", {}).get("issueCreate", {}).get("issue")
                if s_issue:
                    created.append({
                        "type": "Story",
                        "id": s_issue["id"],
                        "identifier": s_issue.get("identifier"),
                        "title": story["title"],
                        "url": s_issue.get("url"),
                        "parent": epic_issue["id"],
                    })

    return {"success": True, "created": created}
