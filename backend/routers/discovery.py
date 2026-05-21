"""
Discovery loop endpoints — insights, themes, opportunities, features, metrics.

This is the surface the frontend Opportunities panel + the OpportunityAgent
specialist read & write through. Insights are produced by the background
extractor (agent/discovery.py); opportunities/features are user- or
agent-curated.
"""
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from deps import get_supabase, get_user_id

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Models ────────────────────────────────────────────────────────────────────

class OpportunityCreate(BaseModel):
    project_id: str
    title: str
    problem: str
    proposed_solution: Optional[str] = None
    evidence_insight_ids: list[str] = Field(default_factory=list)
    theme_ids: list[str] = Field(default_factory=list)
    reach: Optional[int] = None
    impact: Optional[int] = None
    confidence: Optional[int] = None
    effort: Optional[int] = None
    risks: Optional[str] = None


class OpportunityUpdate(BaseModel):
    title: Optional[str] = None
    problem: Optional[str] = None
    proposed_solution: Optional[str] = None
    evidence_insight_ids: Optional[list[str]] = None
    theme_ids: Optional[list[str]] = None
    reach: Optional[int] = None
    impact: Optional[int] = None
    confidence: Optional[int] = None
    effort: Optional[int] = None
    risks: Optional[str] = None
    status: Optional[str] = None


class FeatureCreate(BaseModel):
    project_id: str
    name: str
    summary: Optional[str] = None
    opportunity_ids: list[str] = Field(default_factory=list)
    prd_document_id: Optional[str] = None


class FeatureUpdate(BaseModel):
    name: Optional[str] = None
    summary: Optional[str] = None
    opportunity_ids: Optional[list[str]] = None
    prd_document_id: Optional[str] = None
    status: Optional[str] = None
    shipped_at: Optional[str] = None
    ui_proposal: Optional[dict] = None
    tickets_export_ref: Optional[str] = None


class MetricCreate(BaseModel):
    feature_id: str
    name: str
    baseline: Optional[float] = None
    target: Optional[float] = None
    current: Optional[float] = None
    source: Optional[str] = None


# ── Insights ──────────────────────────────────────────────────────────────────

@router.get("/insights")
async def list_insights(
    project_id: str,
    theme_id: Optional[str] = None,
    sentiment: Optional[str] = None,
    min_severity: int = Query(default=1, ge=1, le=5),
    limit: int = Query(default=200, ge=1, le=1000),
    user_id: str = Depends(get_user_id),
):
    supabase = get_supabase()
    q = (
        supabase.table("insights")
        .select("*, knowledge_documents(filename)")
        .eq("project_id", project_id)
        .eq("user_id", user_id)
        .gte("severity", min_severity)
        .order("severity", desc=True)
        .order("created_at", desc=True)
        .limit(limit)
    )
    if theme_id:
        q = q.eq("theme_id", theme_id)
    if sentiment:
        q = q.eq("sentiment", sentiment)
    res = q.execute()
    return res.data or []


# ── Themes ────────────────────────────────────────────────────────────────────

@router.get("/themes")
async def list_themes(
    project_id: str,
    user_id: str = Depends(get_user_id),
):
    supabase = get_supabase()
    res = (
        supabase.table("themes")
        .select("*")
        .eq("project_id", project_id)
        .eq("user_id", user_id)
        .order("insight_count", desc=True)
        .execute()
    )
    return res.data or []


# ── Opportunities ─────────────────────────────────────────────────────────────

@router.get("/opportunities")
async def list_opportunities(
    project_id: str,
    status: Optional[str] = None,
    user_id: str = Depends(get_user_id),
):
    supabase = get_supabase()
    q = (
        supabase.table("opportunities")
        .select("*")
        .eq("project_id", project_id)
        .eq("user_id", user_id)
        .order("rice_score", desc=True, nullsfirst=False)
        .order("created_at", desc=True)
    )
    if status:
        q = q.eq("status", status)
    res = q.execute()
    return res.data or []


@router.post("/opportunities")
async def create_opportunity(
    body: OpportunityCreate,
    user_id: str = Depends(get_user_id),
):
    supabase = get_supabase()
    payload = body.model_dump(exclude_none=True)
    payload["user_id"] = user_id
    try:
        res = supabase.table("opportunities").insert(payload).execute()
    except Exception as e:
        logger.error("Opportunity insert failed: %s", e)
        raise HTTPException(status_code=400, detail=str(e))
    if not res.data:
        raise HTTPException(status_code=500, detail="Insert returned no row")
    return res.data[0]


@router.patch("/opportunities/{opp_id}")
async def update_opportunity(
    opp_id: str,
    body: OpportunityUpdate,
    user_id: str = Depends(get_user_id),
):
    supabase = get_supabase()
    payload = body.model_dump(exclude_none=True)
    if not payload:
        raise HTTPException(status_code=400, detail="No fields to update")
    try:
        res = (
            supabase.table("opportunities")
            .update(payload)
            .eq("id", opp_id)
            .eq("user_id", user_id)
            .execute()
        )
    except Exception as e:
        logger.error("Opportunity update failed: %s", e)
        raise HTTPException(status_code=400, detail=str(e))
    if not res.data:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    return res.data[0]


@router.delete("/opportunities/{opp_id}")
async def delete_opportunity(
    opp_id: str,
    user_id: str = Depends(get_user_id),
):
    supabase = get_supabase()
    supabase.table("opportunities").delete().eq("id", opp_id).eq("user_id", user_id).execute()
    return {"success": True}


# ── Features ──────────────────────────────────────────────────────────────────

@router.get("/features")
async def list_features(
    project_id: str,
    user_id: str = Depends(get_user_id),
):
    supabase = get_supabase()
    res = (
        supabase.table("features")
        .select("*")
        .eq("project_id", project_id)
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return res.data or []


@router.post("/features")
async def create_feature(
    body: FeatureCreate,
    user_id: str = Depends(get_user_id),
):
    supabase = get_supabase()
    payload = body.model_dump(exclude_none=True)
    payload["user_id"] = user_id
    try:
        res = supabase.table("features").insert(payload).execute()
    except Exception as e:
        logger.error("Feature insert failed: %s", e)
        raise HTTPException(status_code=400, detail=str(e))
    if not res.data:
        raise HTTPException(status_code=500, detail="Insert returned no row")

    # Auto-bump opportunity status → 'committed' for any linked opps.
    if body.opportunity_ids:
        try:
            (
                supabase.table("opportunities")
                .update({"status": "committed"})
                .in_("id", body.opportunity_ids)
                .eq("user_id", user_id)
                .execute()
            )
        except Exception as e:
            logger.warning("Could not bump opportunity status: %s", e)

    return res.data[0]


@router.patch("/features/{feature_id}")
async def update_feature(
    feature_id: str,
    body: FeatureUpdate,
    user_id: str = Depends(get_user_id),
):
    supabase = get_supabase()
    payload = body.model_dump(exclude_none=True)
    if not payload:
        raise HTTPException(status_code=400, detail="No fields to update")
    try:
        res = (
            supabase.table("features")
            .update(payload)
            .eq("id", feature_id)
            .eq("user_id", user_id)
            .execute()
        )
    except Exception as e:
        logger.error("Feature update failed: %s", e)
        raise HTTPException(status_code=400, detail=str(e))
    if not res.data:
        raise HTTPException(status_code=404, detail="Feature not found")
    return res.data[0]


# ── Metrics ───────────────────────────────────────────────────────────────────

@router.get("/features/{feature_id}/metrics")
async def list_metrics(
    feature_id: str,
    user_id: str = Depends(get_user_id),
):
    supabase = get_supabase()
    res = (
        supabase.table("metrics")
        .select("*")
        .eq("feature_id", feature_id)
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return res.data or []


@router.post("/metrics")
async def create_metric(
    body: MetricCreate,
    user_id: str = Depends(get_user_id),
):
    supabase = get_supabase()
    payload = body.model_dump(exclude_none=True)
    payload["user_id"] = user_id
    try:
        res = supabase.table("metrics").insert(payload).execute()
    except Exception as e:
        logger.error("Metric insert failed: %s", e)
        raise HTTPException(status_code=400, detail=str(e))
    if not res.data:
        raise HTTPException(status_code=500, detail="Insert returned no row")
    return res.data[0]


# ── Bulk re-extract (wipe + re-run for whole project) ────────────────────────

@router.post("/reextract-all")
async def reextract_all(
    project_id: str,
    user_id: str = Depends(get_user_id),
):
    """Wipe all insights + themes for the project and re-run extraction over
    every non-tabular knowledge document. Useful when the extractor prompt
    has been updated and you want a fresh pass on existing uploads."""
    supabase = get_supabase()

    # 1. Wipe insights (triggers will decrement theme counts, but we wipe
    #    themes outright next so it doesn't matter).
    supabase.table("insights").delete().eq(
        "project_id", project_id
    ).eq("user_id", user_id).execute()
    supabase.table("themes").delete().eq(
        "project_id", project_id
    ).eq("user_id", user_id).execute()

    # 2. List all KB docs in this project.
    docs_res = (
        supabase.table("knowledge_documents")
        .select("id, filename, file_type")
        .eq("project_id", project_id)
        .eq("user_id", user_id)
        .execute()
    )
    docs = docs_res.data or []

    # Skip tabular files — they don't go through the extractor pipeline.
    text_docs = [
        d for d in docs
        if not any(d["filename"].lower().endswith(ext) for ext in (".csv", ".xlsx", ".xls"))
    ]

    from agent.discovery import extract_insights_for_document
    total = 0
    per_doc: list[dict] = []
    for d in text_docs:
        saved = await extract_insights_for_document(
            knowledge_document_id=d["id"],
            project_id=project_id,
            user_id=user_id,
            filename=d["filename"],
        )
        total += saved
        per_doc.append({"document_id": d["id"], "filename": d["filename"], "insights": saved})

    return {
        "success": True,
        "documents_processed": len(text_docs),
        "documents_skipped_tabular": len(docs) - len(text_docs),
        "total_insights": total,
        "per_doc": per_doc,
    }


# ── Trigger extraction manually (re-run on existing doc) ──────────────────────

@router.post("/extract/{knowledge_document_id}")
async def trigger_extraction(
    knowledge_document_id: str,
    project_id: str,
    user_id: str = Depends(get_user_id),
):
    """Re-run insight extraction over an existing KB document. Useful when
    extraction failed during upload or when the prompt has been updated."""
    supabase = get_supabase()

    # Verify ownership + fetch filename
    res = (
        supabase.table("knowledge_documents")
        .select("filename")
        .eq("id", knowledge_document_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Document not found")
    filename = res.data[0]["filename"]

    # Delete prior insights for this doc to avoid duplicates
    supabase.table("insights").delete().eq(
        "knowledge_document_id", knowledge_document_id
    ).eq("user_id", user_id).execute()

    from agent.discovery import extract_insights_for_document
    saved = await extract_insights_for_document(
        knowledge_document_id=knowledge_document_id,
        project_id=project_id,
        user_id=user_id,
        filename=filename,
    )
    return {"success": True, "insights_saved": saved}
