import os
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
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


# ── Calendar ──────────────────────────────────────────────────────────────────

def _parse_dt(val: str | None) -> datetime | None:
    if not val:
        return None
    for fmt in ("%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%dT%H:%M:%S.%f%z"):
        try:
            return datetime.strptime(val.replace("Z", "+00:00") if val.endswith("Z") else val, fmt)
        except ValueError:
            continue
    return None


def _fmt_time(dt: datetime | None) -> str:
    if not dt:
        return ""
    local = dt.astimezone()
    # %-I is Linux-only; strip leading zero manually for cross-platform support
    return local.strftime("%I:%M %p").lstrip("0") or "12:00 AM"


def _detect_conflicts(events: list[dict]) -> list[dict]:
    conflicts: list[dict] = []
    block_start: datetime | None = None
    block_minutes = 0
    block_event_ids: list[str] = []
    prev_end: datetime | None = None

    for i, ev in enumerate(events):
        s = ev.get("_start_dt")
        e = ev.get("_end_dt")
        if not s or not e:
            continue

        # Overlap with previous event
        if prev_end and s < prev_end:
            conflicts.append({
                "type": "overlap",
                "message": f"Conflict at {ev['start_formatted']}: \"{events[i-1]['title']}\" and \"{ev['title']}\" overlap.",
                "at": ev["start_formatted"],
                "event_ids": [events[i - 1]["id"], ev["id"]],
            })
        # Back-to-back (gap < 10 min)
        elif prev_end and (s - prev_end).total_seconds() < 600:
            conflicts.append({
                "type": "back_to_back",
                "message": f"No break between \"{events[i-1]['title']}\" and \"{ev['title']}\" at {ev['start_formatted']}.",
                "at": ev["start_formatted"],
                "event_ids": [events[i - 1]["id"], ev["id"]],
            })

        # Marathon block detection
        if prev_end is None or (s - prev_end).total_seconds() >= 1800:
            block_start = s
            block_minutes = ev["duration_minutes"]
            block_event_ids = [ev["id"]]
        else:
            block_minutes += ev["duration_minutes"]
            block_event_ids.append(ev["id"])

        if block_minutes >= 180 and block_start:
            already = any(
                c["type"] == "marathon" and c.get("_block_start") == block_start.isoformat()
                for c in conflicts
            )
            if not already:
                conflicts.append({
                    "type": "marathon",
                    "message": f"{block_minutes // 60}h {block_minutes % 60}m of back-to-back meetings starting {_fmt_time(block_start)}. Consider scheduling a break.",
                    "at": _fmt_time(block_start),
                    "_block_start": block_start.isoformat(),
                    "event_ids": list(block_event_ids),
                })

        prev_end = e

    return [{k: v for k, v in c.items() if not k.startswith("_")} for c in conflicts]


async def _get_clerk_oauth_token(user_id: str, provider: str = "oauth_google") -> str | None:
    """Fetch a user's OAuth access token from Clerk API using the secret key."""
    secret_key = os.getenv("CLERK_SECRET_KEY")
    if not secret_key:
        return None
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(
            f"https://api.clerk.com/v1/users/{user_id}/oauth_access_tokens/{provider}",
            headers={"Authorization": f"Bearer {secret_key}"},
        )
    if res.status_code != 200:
        return None
    data = res.json()
    if not data:
        return None
    return data[0].get("token")


async def _fetch_google_events(token: str, date: datetime) -> list[dict]:
    # timeMin uses current time so Google only returns events that haven't ended yet
    # (Google's timeMin = lower bound for event's end time, so in-progress meetings are included)
    day_end = date.replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=timezone.utc) + timedelta(days=1)

    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(
            "https://www.googleapis.com/calendar/v3/calendars/primary/events",
            headers={"Authorization": f"Bearer {token}"},
            params={
                "timeMin": date.isoformat(),
                "timeMax": day_end.isoformat(),
                "singleEvents": "true",
                "orderBy": "startTime",
                "maxResults": "20",
            },
        )

    if res.status_code == 401:
        raise HTTPException(status_code=401, detail="Google Calendar token expired or invalid. Please reconnect.")
    if res.status_code == 403:
        raise HTTPException(status_code=403, detail="Missing calendar.readonly scope. Enable it in Clerk Dashboard.")
    if res.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Google Calendar API error: {res.status_code}")

    items = res.json().get("items", [])
    events = []
    for item in items:
        start_raw = item.get("start", {})
        end_raw = item.get("end", {})
        is_all_day = "date" in start_raw and "dateTime" not in start_raw

        start_str = start_raw.get("dateTime") or start_raw.get("date", "")
        end_str = end_raw.get("dateTime") or end_raw.get("date", "")
        start_dt = _parse_dt(start_str)
        end_dt = _parse_dt(end_str)

        duration_minutes = 0
        if start_dt and end_dt:
            duration_minutes = max(0, int((end_dt - start_dt).total_seconds() / 60))

        meet_link = None
        conf = item.get("conferenceData", {})
        for ep in conf.get("entryPoints", []):
            if ep.get("entryPointType") == "video":
                meet_link = ep.get("uri")
                break

        events.append({
            "id": item.get("id", ""),
            "title": item.get("summary", "Busy"),
            "start": start_str,
            "end": end_str,
            "start_formatted": _fmt_time(start_dt) if not is_all_day else "All day",
            "end_formatted": _fmt_time(end_dt) if not is_all_day else "",
            "duration_minutes": duration_minutes,
            "is_all_day": is_all_day,
            "location": item.get("location", ""),
            "meet_link": meet_link,
            "attendee_count": len(item.get("attendees", [])),
            "html_link": item.get("htmlLink", ""),
            "_start_dt": start_dt,
            "_end_dt": end_dt,
        })
    return events


async def _fetch_microsoft_events(token: str, date: datetime) -> list[dict]:
    """Microsoft Graph Calendar — same shape as Google output."""
    day_end = date.replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=timezone.utc) + timedelta(days=1)

    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(
            "https://graph.microsoft.com/v1.0/me/calendarView",
            headers={"Authorization": f"Bearer {token}", "Prefer": 'outlook.timezone="UTC"'},
            params={
                "startDateTime": date.isoformat(),
                "endDateTime": day_end.isoformat(),
                "$orderby": "start/dateTime",
                "$top": "20",
                "$select": "id,subject,start,end,location,isAllDay,onlineMeeting,attendees",
            },
        )

    if res.status_code == 401:
        raise HTTPException(status_code=401, detail="Microsoft Calendar token expired. Please reconnect.")
    if res.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Microsoft Graph API error: {res.status_code}")

    items = res.json().get("value", [])
    events = []
    for item in items:
        start_str = item.get("start", {}).get("dateTime", "")
        end_str = item.get("end", {}).get("dateTime", "")
        is_all_day = item.get("isAllDay", False)
        start_dt = _parse_dt(start_str)
        end_dt = _parse_dt(end_str)

        duration_minutes = 0
        if start_dt and end_dt:
            duration_minutes = max(0, int((end_dt - start_dt).total_seconds() / 60))

        meet_link = item.get("onlineMeeting", {}).get("joinUrl") if item.get("onlineMeeting") else None
        loc = item.get("location", {}).get("displayName", "") if isinstance(item.get("location"), dict) else ""

        events.append({
            "id": item.get("id", ""),
            "title": item.get("subject", "Busy"),
            "start": start_str,
            "end": end_str,
            "start_formatted": _fmt_time(start_dt) if not is_all_day else "All day",
            "end_formatted": _fmt_time(end_dt) if not is_all_day else "",
            "duration_minutes": duration_minutes,
            "is_all_day": is_all_day,
            "location": loc,
            "meet_link": meet_link,
            "attendee_count": len(item.get("attendees", [])),
            "html_link": "",
            "_start_dt": start_dt,
            "_end_dt": end_dt,
        })
    return events


@router.get("/calendar/upcoming")
async def get_calendar_upcoming(
    provider: str = "google",
    user_id: str = Depends(get_user_id),
):
    """
    Fetch today's calendar events and detect scheduling conflicts.

    Token is fetched server-side from Clerk using CLERK_SECRET_KEY — no token
    required from the frontend. Requires calendar.readonly scope on the Google
    social connection in Clerk Dashboard.
    """
    clerk_provider = f"oauth_{provider}"
    token = await _get_clerk_oauth_token(user_id, clerk_provider)

    if not token:
        raise HTTPException(
            status_code=400,
            detail=(
                f"{provider.capitalize()} Calendar not connected. "
                "Enable the calendar.readonly scope on your Google social connection "
                "in the Clerk Dashboard."
            ),
        )

    now = datetime.now(timezone.utc)

    if provider == "microsoft":
        events = await _fetch_microsoft_events(token, now)
    else:
        events = await _fetch_google_events(token, now)

    # Drop already-finished events; keep all-day and in-progress/upcoming
    events = [
        ev for ev in events
        if ev.get("is_all_day") or (ev.get("_end_dt") and ev["_end_dt"] > now)
    ]

    conflicts = _detect_conflicts(events)

    # Strip internal _dt fields before returning
    clean_events = [{k: v for k, v in ev.items() if not k.startswith("_")} for ev in events]
    total_minutes = sum(ev["duration_minutes"] for ev in clean_events if not ev["is_all_day"])

    return {
        "events": clean_events,
        "conflicts": conflicts,
        "provider": provider,
        "total_meeting_minutes": total_minutes,
        "date": now.strftime("%A, %B ") + str(now.day),
    }
