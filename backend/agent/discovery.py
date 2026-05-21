"""
Insight extraction — the spine of the discovery loop.

After a KB document is uploaded and chunked, run a cheap LLM pass over each
chunk to surface quote-level insights (problems, desires, surprises) with
sentiment + themes. Insights are linked back to their source chunk so the
UI can show provenance.

Designed to be fire-and-forget from the upload handler. Failures here must
NOT bubble up to the user — the chunks are already indexed and searchable.
"""
import asyncio
import json
import logging
import re
from typing import Any

from deps import get_supabase
from llm.factory import get_llm_provider

logger = logging.getLogger(__name__)


# Cheap router-tier model — same one the orchestrator uses. Insight extraction
# is volume-heavy; we don't want to burn Pro tokens on it.
EXTRACTOR_PROVIDER = "gemini"
EXTRACTOR_MODEL = "gemini-2.5-flash-lite"

# Cap how many chunks we process per upload to keep costs predictable. For a
# typical 30-page PDF (~30 chunks) we still cover everything.
MAX_CHUNKS_PER_DOC = 80

# Skip chunks shorter than this — usually headers, page numbers, junk.
MIN_CHUNK_CHARS = 120


EXTRACTOR_SYSTEM = """You extract product-discovery insights from raw text — user interview transcripts, support tickets, surveys, research notes.

You output ONLY valid JSON in EXACTLY this shape (no markdown fences, no prose):

{
  "insights": [
    {
      "quote": "<verbatim or near-verbatim snippet from the text, <=300 chars>",
      "paraphrase": "<one sentence: what the customer is saying in plain language>",
      "sentiment": "positive" | "neutral" | "negative" | "mixed",
      "themes": ["<short noun phrase>", ...],
      "persona": "<who said it, if inferable from text — e.g. 'enterprise admin', 'first-time user'; omit if unclear>",
      "severity": 1
    }
  ]
}

Rules:
- Only extract insights that name a concrete problem, desire, frustration, or surprising statement. SKIP generic chatter, greetings, scheduling, neutral acknowledgements.
- `severity`: 1=mild gripe, 2=annoyance, 3=blocker workaround, 4=churn risk, 5=critical / data loss / lost revenue.
- If the chunk has nothing extractable, return {"insights": []}. Don't manufacture insights.
- Aim for 0-4 insights per chunk. Quality over quantity.

QUOTE QUALITY RULES — read carefully, these are common failure modes:
- `quote` MUST appear (verbatim or near-verbatim) in the input text.
- A quote MUST be a complete thought. It must end on a sentence terminator
  (. ! ?) OR a closing quotation mark. NEVER end a quote mid-word, mid-clause,
  or with a dangling conjunction ("and", "but", "because", "th...", etc.).
- If the most relevant excerpt would end mid-thought, EXTEND the quote until
  it reaches a natural terminator OR drop that insight entirely.
- Prefer two complete sentences (~20-200 chars) over one truncated phrase.
- Strip leading speaker labels ("Maya:", "Aanya:") — the quote should be
  the speaker's actual words, not the formatting.
- If a quote starts mid-sentence (the chunk boundary cut the start), find a
  cleaner self-contained sentence elsewhere in the chunk, or skip.

`paraphrase`: one full sentence summarising the insight in plain language.
Always provide this — it's how the UI shows the insight when the raw quote
is too long or context-poor.

THEMES — CRITICAL — READ CAREFULLY:
- Themes are 1-2 BROAD, REUSABLE category labels. Lowercase noun phrases, no punctuation.
- USE THE BROADEST LABEL THAT APPLIES. "page load slow", "filter reset", and "dashboard lag" are ALL the same theme: "dashboard performance".
- Prefer themes from this canonical list when applicable (extend only when none fit):
    onboarding · pricing · performance · mobile experience · integrations ·
    reporting · notifications · bulk operations · search · permissions ·
    data accuracy · documentation · support quality · billing
- If two themes feel similar, USE THE SAME ONE. Splitting "shopify sync" and "quickbooks sync" into separate themes is WRONG — both are "integrations".
- Aim for AT MOST 8 distinct themes across an entire project's worth of feedback. If you find yourself coining a 9th theme, you're being too granular.
"""


def _strip_fences(raw: str) -> str:
    s = raw.strip()
    s = re.sub(r"^```(?:json)?\s*", "", s)
    s = re.sub(r"\s*```\s*$", "", s)
    return s.strip()


async def _extract_from_chunk(chunk_text: str, filename: str) -> list[dict]:
    """Single LLM call → list of insight dicts. Returns [] on any failure."""
    try:
        llm = get_llm_provider(
            provider_override=EXTRACTOR_PROVIDER,
            model_override=EXTRACTOR_MODEL,
        )
    except Exception as e:
        logger.warning("Extractor LLM unavailable: %s", e)
        return []

    user_prompt = (
        f"Source file: {filename}\n\n"
        f"TEXT:\n{chunk_text[:4000]}\n\n"
        "Output the JSON now."
    )

    parts: list[str] = []
    try:
        async for tok in llm.complete(EXTRACTOR_SYSTEM, user_prompt):
            parts.append(tok)
    except Exception as e:
        logger.warning("Extractor LLM call failed: %s", e)
        return []

    raw = _strip_fences("".join(parts))
    if not raw:
        return []

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        logger.warning("Extractor returned non-JSON (%s): %.200s", e, raw)
        return []

    items = data.get("insights") or []
    if not isinstance(items, list):
        return []

    cleaned: list[dict] = []
    for it in items:
        if not isinstance(it, dict):
            continue
        quote = (it.get("quote") or "").strip()
        # Strip wrapping quotes that the model sometimes adds
        if (quote.startswith('"') and quote.endswith('"')) or (
            quote.startswith("'") and quote.endswith("'")
        ):
            quote = quote[1:-1].strip()
        # Strip speaker labels like "Aanya:" / "Maya R.:"
        quote = re.sub(r"^[A-Z][A-Za-z .\-]{0,40}:\s+", "", quote)
        if len(quote) < 20:
            continue
        # Reject quotes that end mid-thought. A clean quote ends on
        # terminal punctuation (. ! ?) optionally followed by a closing
        # quote / bracket. Anything else is the model truncating.
        if not re.search(r'[.!?]["\'\)\]]?\s*$', quote):
            logger.debug("Rejecting truncated quote: %r", quote[:120])
            continue
        # Reject quotes that look like sentence fragments (start with a
        # conjunction or end with one we missed)
        if re.match(r"^(and|but|so|or|because|though|although)\b", quote, re.I):
            continue
        themes_raw = it.get("themes") or []
        themes = [
            re.sub(r"[^a-z0-9\s/&-]", "", str(t).strip().lower())[:60]
            for t in themes_raw
            if str(t).strip()
        ][:3]
        sentiment = str(it.get("sentiment") or "neutral").lower()
        if sentiment not in {"positive", "neutral", "negative", "mixed"}:
            sentiment = "neutral"
        try:
            severity = max(1, min(5, int(it.get("severity") or 2)))
        except (TypeError, ValueError):
            severity = 2
        cleaned.append({
            "quote": quote[:1200],
            "paraphrase": (it.get("paraphrase") or "")[:600] or None,
            "sentiment": sentiment,
            "themes": themes,
            "persona": (it.get("persona") or "").strip()[:120] or None,
            "severity": severity,
        })
    return cleaned


def _upsert_themes(
    supabase: Any,
    project_id: str,
    user_id: str,
    theme_names: list[str],
) -> dict[str, str]:
    """Ensure each name exists in `themes` table; return name → id map."""
    if not theme_names:
        return {}

    unique = sorted({n for n in theme_names if n})
    name_to_id: dict[str, str] = {}

    # Read existing
    try:
        existing = (
            supabase.table("themes")
            .select("id, name")
            .eq("project_id", project_id)
            .in_("name", unique)
            .execute()
        )
        for row in existing.data or []:
            name_to_id[row["name"]] = row["id"]
    except Exception as e:
        logger.warning("Theme lookup failed: %s", e)

    # Insert missing
    missing = [n for n in unique if n not in name_to_id]
    if missing:
        rows = [
            {"project_id": project_id, "user_id": user_id, "name": n}
            for n in missing
        ]
        try:
            ins = supabase.table("themes").insert(rows).execute()
            for row in ins.data or []:
                name_to_id[row["name"]] = row["id"]
        except Exception as e:
            # Unique-violation race condition — re-read
            logger.info("Theme insert race or error (%s) — re-reading", e)
            try:
                re_read = (
                    supabase.table("themes")
                    .select("id, name")
                    .eq("project_id", project_id)
                    .in_("name", missing)
                    .execute()
                )
                for row in re_read.data or []:
                    name_to_id[row["name"]] = row["id"]
            except Exception as e2:
                logger.warning("Theme re-read failed: %s", e2)

    return name_to_id


async def extract_insights_for_document(
    *,
    knowledge_document_id: str,
    project_id: str,
    user_id: str,
    filename: str,
) -> int:
    """
    Run extraction over every chunk for the given KB document and persist
    insights. Returns the count of insights saved. Safe to call concurrently.
    """
    supabase = get_supabase()

    try:
        chunks_res = (
            supabase.table("knowledge_chunks")
            .select("id, content")
            .eq("knowledge_document_id", knowledge_document_id)
            .eq("user_id", user_id)
            .order("created_at")
            .limit(MAX_CHUNKS_PER_DOC)
            .execute()
        )
    except Exception as e:
        logger.error("Insight extraction — chunk fetch failed: %s", e)
        return 0

    chunks = [
        c for c in (chunks_res.data or [])
        if len((c.get("content") or "")) >= MIN_CHUNK_CHARS
    ]
    if not chunks:
        logger.info("Insight extraction — no eligible chunks for doc=%s", knowledge_document_id)
        return 0

    logger.info(
        "Insight extraction — doc=%s file=%s chunks=%d",
        knowledge_document_id, filename, len(chunks),
    )

    # Run chunk extractions concurrently with a small cap to avoid hammering
    # the LLM provider's rate limit. 5 concurrent calls is comfortable for
    # Gemini Flash-Lite.
    sem = asyncio.Semaphore(5)

    async def _process(chunk: dict) -> list[dict]:
        async with sem:
            results = await _extract_from_chunk(chunk["content"], filename)
            for r in results:
                r["_chunk_id"] = chunk["id"]
            return results

    chunk_results = await asyncio.gather(*[_process(c) for c in chunks])
    flat: list[dict] = [r for sub in chunk_results for r in sub]
    if not flat:
        logger.info("Insight extraction — no insights surfaced for doc=%s", knowledge_document_id)
        return 0

    # Resolve theme names → ids
    all_themes = sorted({t for r in flat for t in r["themes"]})
    name_to_id = _upsert_themes(supabase, project_id, user_id, all_themes)

    rows = []
    for r in flat:
        primary_theme = r["themes"][0] if r["themes"] else None
        rows.append({
            "project_id": project_id,
            "user_id": user_id,
            "knowledge_document_id": knowledge_document_id,
            "knowledge_chunk_id": r["_chunk_id"],
            "quote": r["quote"],
            "paraphrase": r["paraphrase"],
            "sentiment": r["sentiment"],
            "themes": r["themes"],
            "theme_id": name_to_id.get(primary_theme) if primary_theme else None,
            "persona": r["persona"],
            "severity": r["severity"],
        })

    # Bulk insert in batches of 100 (Supabase limit per request is generous
    # but smaller batches recover better from partial failures).
    saved = 0
    for i in range(0, len(rows), 100):
        batch = rows[i:i + 100]
        try:
            res = supabase.table("insights").insert(batch).execute()
            saved += len(res.data or [])
        except Exception as e:
            logger.warning("Insight batch insert failed (batch %d): %s", i // 100, e)

    logger.info(
        "Insight extraction complete — doc=%s saved=%d themes=%d",
        knowledge_document_id, saved, len(name_to_id),
    )
    return saved


def schedule_extraction(
    *,
    knowledge_document_id: str,
    project_id: str,
    user_id: str,
    filename: str,
) -> None:
    """Fire-and-forget. Used by routers/knowledge.py after a successful upload."""
    async def _runner():
        try:
            await extract_insights_for_document(
                knowledge_document_id=knowledge_document_id,
                project_id=project_id,
                user_id=user_id,
                filename=filename,
            )
        except Exception as e:
            logger.exception("Background insight extraction crashed: %s", e)

    try:
        asyncio.get_running_loop().create_task(_runner())
    except RuntimeError:
        # No running loop (e.g. called from sync context) — fall back.
        asyncio.run(_runner())
