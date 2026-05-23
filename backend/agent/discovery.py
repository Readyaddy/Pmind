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

# If the whole document fits under this limit, pass it in one shot —
# no splitting needed, full context, one LLM call.
WHOLE_DOC_CHAR_LIMIT = 28_000   # ~7k tokens, comfortably within flash-lite

# For larger docs we split into semantic segments, each up to this size.
MAX_SEGMENT_CHARS = 5_000

# Skip segments shorter than this — headers, cover pages, junk.
MIN_SEGMENT_CHARS = 120


# ── Semantic segmentation ────────────────────────────────────────────────────
#
# RAG chunks (800 chars, stored in knowledge_chunks) are optimised for
# retrieval — small, targeted, overlapping. They are WRONG for insight
# extraction: a speaker turn split across two chunks destroys the quote.
#
# These helpers produce semantically complete units: whole conversations,
# full ticket threads, or natural section boundaries. The LLM never sees
# a thought cut in half.

_SPEAKER_TURN = re.compile(r"^[A-Z][A-Za-z .'\-]{0,35}:\s", re.MULTILINE)
_TICKET_SEP   = re.compile(r"(?:\n[-=*]{4,}\n|\n\n#+\s|--+ticket--+|Case #\d)", re.IGNORECASE)
_SECTION_SEP  = re.compile(r"\n{2,}")


def _looks_like_interview(text: str) -> bool:
    """At least 4 speaker-turn labels in the first 3000 chars."""
    return len(_SPEAKER_TURN.findall(text[:3000])) >= 4


def _looks_like_tickets(text: str) -> bool:
    return bool(_TICKET_SEP.search(text[:5000]))


def _split_on_turns(text: str) -> list[str]:
    """
    Group consecutive speaker turns into segments of up to MAX_SEGMENT_CHARS.
    Each segment always ends on a complete turn — never mid-sentence.
    """
    # Find every turn boundary position
    boundaries = [m.start() for m in _SPEAKER_TURN.finditer(text)]
    if not boundaries:
        return [text]

    segments: list[str] = []
    seg_start = 0
    seg_end = boundaries[0]  # text before the first labelled turn

    for i, pos in enumerate(boundaries):
        next_pos = boundaries[i + 1] if i + 1 < len(boundaries) else len(text)
        turn_len = next_pos - pos

        if (pos - seg_start) + turn_len > MAX_SEGMENT_CHARS and pos > seg_start:
            chunk = text[seg_start:pos].strip()
            if len(chunk) >= MIN_SEGMENT_CHARS:
                segments.append(chunk)
            seg_start = pos

        seg_end = next_pos

    # Flush remainder
    tail = text[seg_start:].strip()
    if len(tail) >= MIN_SEGMENT_CHARS:
        segments.append(tail)

    return segments or [text]


def _split_on_tickets(text: str) -> list[str]:
    parts = [p.strip() for p in _TICKET_SEP.split(text) if p.strip()]
    out: list[str] = []
    buf = ""
    for part in parts:
        if len(buf) + len(part) > MAX_SEGMENT_CHARS and buf:
            out.append(buf)
            buf = part
        else:
            buf = (buf + "\n\n" + part).strip() if buf else part
    if buf:
        out.append(buf)
    return [s for s in out if len(s) >= MIN_SEGMENT_CHARS]


def _split_on_paragraphs(text: str) -> list[str]:
    """Fallback: group paragraphs into segments, never cutting mid-paragraph."""
    paras = [p.strip() for p in _SECTION_SEP.split(text) if p.strip()]
    out: list[str] = []
    buf = ""
    for para in paras:
        if len(buf) + len(para) > MAX_SEGMENT_CHARS and buf:
            out.append(buf)
            buf = para
        else:
            buf = (buf + "\n\n" + para).strip() if buf else para
    if buf:
        out.append(buf)
    return [s for s in out if len(s) >= MIN_SEGMENT_CHARS]


def segment_for_extraction(text: str) -> list[str]:
    """
    Return semantically complete segments for insight extraction.

    Decision tree:
      1. Small doc  → one segment (whole doc) — full context, one LLM call
      2. Interview  → split on speaker turns — Q+A pairs stay together
      3. Tickets    → split on ticket boundaries — each ticket is one unit
      4. Anything else → split on paragraph/section breaks
    """
    text = text.strip()
    if not text:
        return []

    # 1. Small enough — pass whole doc
    if len(text) <= WHOLE_DOC_CHAR_LIMIT:
        return [text]

    # 2. Interview / conversation format
    if _looks_like_interview(text):
        segs = _split_on_turns(text)
        logger.debug("Segmentation: interview format → %d turns", len(segs))
        return segs

    # 3. Support ticket / thread format
    if _looks_like_tickets(text):
        segs = _split_on_tickets(text)
        logger.debug("Segmentation: ticket format → %d tickets", len(segs))
        return segs

    # 4. Paragraph-based fallback
    segs = _split_on_paragraphs(text)
    logger.debug("Segmentation: paragraph fallback → %d segments", len(segs))
    return segs


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
    full_text: str,
) -> int:
    """
    Run extraction over the document's full text using semantic segments and
    persist insights. Returns the count of insights saved.

    `full_text` is the raw extracted text passed directly from the upload
    handler — NOT the RAG chunks, which are too small for accurate extraction.
    """
    supabase = get_supabase()

    segments = segment_for_extraction(full_text)
    if not segments:
        logger.info("Insight extraction — no usable segments for doc=%s", knowledge_document_id)
        return 0

    logger.info(
        "Insight extraction — doc=%s file=%s segments=%d mode=%s",
        knowledge_document_id, filename, len(segments),
        "whole-doc" if len(segments) == 1 else "segmented",
    )

    # Run segment extractions concurrently with a small cap.
    sem = asyncio.Semaphore(5)

    async def _process(seg_text: str) -> list[dict]:
        async with sem:
            return await _extract_from_chunk(seg_text, filename)

    seg_results = await asyncio.gather(*[_process(s) for s in segments])
    flat: list[dict] = [r for sub in seg_results for r in sub]
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
    full_text: str,
) -> None:
    """Fire-and-forget. Used by routers/knowledge.py after a successful upload."""
    async def _runner():
        try:
            await extract_insights_for_document(
                knowledge_document_id=knowledge_document_id,
                project_id=project_id,
                user_id=user_id,
                filename=filename,
                full_text=full_text,
            )
        except Exception as e:
            logger.exception("Background insight extraction crashed: %s", e)

    try:
        asyncio.get_running_loop().create_task(_runner())
    except RuntimeError:
        # No running loop (e.g. called from sync context) — fall back.
        asyncio.run(_runner())
