import json
import logging
import io
import os
import re
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from deps import get_supabase, get_user_id
from google import genai
import PyPDF2
import docx

from agent.discovery import schedule_extraction

logger = logging.getLogger(__name__)
router = APIRouter()

TABULAR_EXTENSIONS = {".csv", ".xlsx", ".xls"}
TEXT_EXTENSIONS = {".md", ".txt", ".json", ".yaml", ".yml", ".xml", ".rtf"}
HTML_EXTENSIONS = {".html", ".htm"}

ROWS_PER_CHUNK = 10       # rows bundled into one semantic chunk
MAX_CHUNKS = 500          # guard against enormous files


def get_gemini_client():
    api_key = os.getenv("GOOGLE_API_KEY", "")
    return genai.Client(api_key=api_key)


# ── Text chunking (non-tabular) ───────────────────────────────────────────────

# Sentence terminator: ., !, ?, possibly followed by closing quotes/parens.
_SENTENCE_END_RE = re.compile(r'(?<=[.!?])["\'\)\]]?\s+')


def _split_sentences(text: str) -> list[str]:
    """Naive but practical sentence splitter — splits on terminal punctuation
    + whitespace. Keeps the terminator with the preceding sentence."""
    text = text.strip()
    if not text:
        return []
    pieces = _SENTENCE_END_RE.split(text)
    return [p.strip() for p in pieces if p.strip()]


def chunk_text(text: str, chunk_size: int = 1000, overlap: int = 200) -> list[str]:
    """
    Sentence-aware chunker. Groups whole sentences into chunks up to
    `chunk_size` chars; carries the trailing ~`overlap` chars of context
    into the next chunk. Critically: chunks never end mid-sentence, so
    downstream insight extraction can quote them verbatim without
    truncating mid-word.

    Falls back to a hard char-cut only if a single sentence exceeds
    `chunk_size` (rare — usually unbroken machine output).
    """
    # First, split on paragraph breaks to preserve natural document structure.
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]

    chunks: list[str] = []
    buffer: list[str] = []
    buf_len = 0

    def flush() -> None:
        nonlocal buffer, buf_len
        if buffer:
            chunks.append(" ".join(buffer).strip())
            buffer = []
            buf_len = 0

    for paragraph in paragraphs:
        sentences = _split_sentences(paragraph)
        if not sentences:
            continue
        for sent in sentences:
            sent_len = len(sent) + 1  # +1 for join space
            # Sentence alone exceeds chunk_size → hard-split it
            if sent_len > chunk_size:
                flush()
                for i in range(0, len(sent), chunk_size):
                    chunks.append(sent[i:i + chunk_size])
                continue
            if buf_len + sent_len > chunk_size:
                flush()
                # Carry overlap: pull the last few sentences forward
                if chunks and overlap > 0:
                    tail = chunks[-1][-overlap:]
                    # Trim to the start of a sentence within tail if possible
                    m = _SENTENCE_END_RE.search(tail)
                    if m:
                        tail = tail[m.end():]
                    if tail:
                        buffer.append(tail.strip())
                        buf_len += len(tail) + 1
            buffer.append(sent)
            buf_len += sent_len
        # Paragraph boundary — break only if buffer already big enough
        if buf_len > chunk_size * 0.6:
            flush()

    flush()
    # Filter pathologically short / blank chunks
    return [c for c in chunks if len(c) >= 30]


# ── Tabular chunking (CSV / Excel) ────────────────────────────────────────────

def _tabular_chunks(filename: str, content_bytes: bytes, ext: str) -> list[str]:
    """
    Convert a CSV/Excel file into semantic, row-based text chunks.

    Every chunk embeds the column headers so the embedding model knows what
    each number means — e.g.
      "Document: metrics.xlsx | Sheet: Q3 | Month: Jan | Revenue: $45,000 | Churn: 2.1%"
    This dramatically improves RAG recall for structured data.
    """
    import pandas as pd

    doc_name = os.path.basename(filename)

    if ext == ".csv":
        try:
            df = pd.read_csv(io.BytesIO(content_bytes))
            sheets: dict[str, "pd.DataFrame"] = {"": df}
        except Exception as e:
            raise ValueError(f"Could not parse CSV: {e}")
    else:
        try:
            xls = pd.ExcelFile(io.BytesIO(content_bytes))
            sheets = {name: xls.parse(name) for name in xls.sheet_names}
        except Exception as e:
            raise ValueError(f"Could not parse Excel: {e}")

    all_chunks: list[str] = []

    for sheet_name, df in sheets.items():
        # Drop fully-empty rows/cols (formatting artifacts)
        df = df.dropna(how="all", axis=0).dropna(how="all", axis=1).reset_index(drop=True)
        if df.empty:
            continue

        df = df.fillna("").astype(str)
        cols = list(df.columns)
        prefix = f"Document: {doc_name}"
        if sheet_name:
            prefix += f" | Sheet: {sheet_name}"

        for batch_start in range(0, min(len(df), MAX_CHUNKS * ROWS_PER_CHUNK), ROWS_PER_CHUNK):
            batch = df.iloc[batch_start : batch_start + ROWS_PER_CHUNK]
            row_lines: list[str] = []
            for _, row in batch.iterrows():
                parts = [prefix]
                for col in cols:
                    val = str(row[col]).strip()
                    if val and val.lower() not in ("nan", "none", ""):
                        parts.append(f"{col}: {val}")
                row_lines.append(" | ".join(parts))
            chunk = "\n".join(row_lines)
            if chunk.strip():
                all_chunks.append(chunk[:2000])  # cap individual chunk length

        if len(all_chunks) >= MAX_CHUNKS:
            logger.warning("Tabular file '%s' truncated at %d chunks", filename, MAX_CHUNKS)
            break

    return all_chunks


# ── Generic text extraction (non-tabular) ─────────────────────────────────────

async def extract_text_from_file(file: UploadFile) -> str:
    content = await file.read()
    filename = (file.filename or "").lower()
    ext = os.path.splitext(filename)[1]

    if ext == ".pdf":
        reader = PyPDF2.PdfReader(io.BytesIO(content))
        return "\n".join(page.extract_text() or "" for page in reader.pages)

    if ext == ".docx":
        doc = docx.Document(io.BytesIO(content))
        return "\n".join(para.text for para in doc.paragraphs)

    if ext in TEXT_EXTENSIONS:
        return content.decode("utf-8", errors="ignore")

    if ext in HTML_EXTENSIONS:
        raw = content.decode("utf-8", errors="ignore")
        text = re.sub(r"<[^>]+>", " ", raw)
        return re.sub(r"\s+", " ", text).strip()

    try:
        return content.decode("utf-8", errors="strict")
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Cannot read '{ext}' as text. "
                "Supported formats: PDF, DOCX, MD, TXT, CSV, XLSX, XLS, JSON, YAML, HTML, XML."
            ),
        )


# ── Embedding helper ──────────────────────────────────────────────────────────

def _embed_chunks(chunks: list[str]) -> list[list[float] | None]:
    """Embed a list of chunks, batching into groups of 100 to avoid API limits.

    Returns a list aligned 1:1 with `chunks`. Any chunk the API failed to
    embed gets a `None` placeholder so callers can skip it without scrambling
    indices.
    """
    from google.genai import types as genai_types
    client = get_gemini_client()
    vectors: list[list[float] | None] = []
    BATCH = 100
    for i in range(0, len(chunks), BATCH):
        batch = chunks[i : i + BATCH]
        try:
            resp = client.models.embed_content(
                model="gemini-embedding-2",
                contents=batch,
                config=genai_types.EmbedContentConfig(output_dimensionality=768),
            )
        except Exception as e:
            logger.warning("Embed batch %d failed: %s — padding with None", i // BATCH, e)
            vectors.extend([None] * len(batch))
            continue
        emb_list = resp.embeddings if hasattr(resp, "embeddings") else resp
        emb_list = list(emb_list or [])
        if len(emb_list) != len(batch):
            logger.warning(
                "Embed batch %d returned %d vectors for %d chunks — padding",
                i // BATCH, len(emb_list), len(batch),
            )
        for j in range(len(batch)):
            if j < len(emb_list):
                emb = emb_list[j]
                vectors.append(emb.values if hasattr(emb, "values") else emb)
            else:
                vectors.append(None)
    return vectors


# ── Discovery value assessment ───────────────────────────────────────────────

_ASSESS_SYSTEM = """You classify whether a document contains customer feedback useful for product discovery.

Respond with ONLY a JSON object — no markdown, no prose:
{"value": "high"|"medium"|"low", "doc_type": "...", "note": "..."}

Definitions:
  "high"   — user interview transcripts, support tickets, customer verbatim quotes,
              NPS/CSAT open responses, churn interviews, survey free-text — direct voice of customer
  "medium" — research reports quoting customers, analyst reports with user data,
              mixed feedback + reference content — signal present but diluted
  "low"    — technical specs, architecture docs, internal process docs, meeting notes
              without customer voice, marketing copy, financial data, competitor analyses —
              useful for RAG but adds nothing to discovery

"doc_type": short human label, e.g. "User interviews", "Support tickets", "Technical spec",
            "Research report", "Survey responses", "Product roadmap", "Financial data"
"note": ≤8 words explaining the call, e.g. "Contains verbatim user quotes" or "No customer voice"

Output only the JSON object."""


async def _assess_discovery_value(text: str) -> dict:
    """Run a cheap LLM call on the first ~1500 chars of extracted text.
    Returns {"value": "high"|"medium"|"low", "doc_type": str, "note": str}.
    Never raises — returns a safe default on any failure.
    """
    from llm.factory import get_llm_provider

    sample = text[:1500].strip()
    if not sample:
        return {"value": "low", "doc_type": "Unknown", "note": "No text extracted"}

    try:
        llm = get_llm_provider(
            model_override="gemini-2.0-flash-lite",
            provider_override="gemini",
        )
        parts: list[str] = []
        async for chunk in llm.complete(_ASSESS_SYSTEM, f"Document sample:\n\n{sample}"):
            parts.append(chunk)
        raw = "".join(parts).strip()
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```\s*$", "", raw).strip()
        result = json.loads(raw)
        if result.get("value") not in ("high", "medium", "low"):
            result["value"] = "low"
        return result
    except Exception as e:
        logger.warning("Discovery assessment failed: %s", e)
        return {"value": "low", "doc_type": "Unknown", "note": "Assessment unavailable"}


# ── Upload endpoint ───────────────────────────────────────────────────────────

@router.post("/")
async def upload_knowledge_document(
    project_id: str = Form(...),
    file: UploadFile = File(...),
    user_id: str = Depends(get_user_id),
):
    supabase = get_supabase()
    filename = file.filename or "upload"
    ext = os.path.splitext(filename)[1].lower()

    # 1. Read raw bytes
    raw_bytes = await file.read()
    await file.seek(0)

    # 2. Build semantic chunks + assess discovery value
    is_tabular = ext in TABULAR_EXTENSIONS
    assessment: dict = {"value": "low", "doc_type": "Data file", "note": "Tabular data — use analyze_data"}
    if is_tabular:
        try:
            chunks = _tabular_chunks(filename, raw_bytes, ext)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        if not chunks:
            raise HTTPException(status_code=400, detail="File appears empty after cleaning.")
    else:
        text = await extract_text_from_file(file)
        if not text.strip():
            raise HTTPException(status_code=400, detail="Could not extract text from file.")
        chunks = chunk_text(text)
        assessment = await _assess_discovery_value(text)

    # 3. Upload original file to Supabase Storage
    storage_path = f"{user_id}/{project_id}/{filename}"
    try:
        supabase.storage.from_("knowledge-files").upload(
            path=storage_path,
            file=raw_bytes,
            file_options={
                "content-type": file.content_type or "application/octet-stream",
                "upsert": "true",
            },
        )
    except Exception as e:
        logger.warning("Storage upload failed (non-fatal) — file=%s: %s", filename, e)
        storage_path = None

    # 4. Save document record (discovery_value / discovery_note stored if columns exist)
    insert_payload: dict = {
        "project_id": project_id,
        "user_id": user_id,
        "filename": filename,
        "file_type": file.content_type or "text/plain",
        "storage_path": storage_path,
    }
    try:
        insert_payload["discovery_value"] = assessment["value"]
        insert_payload["discovery_note"]  = assessment.get("note", "")
        insert_payload["doc_type"]        = assessment.get("doc_type", "")
    except Exception:
        pass  # columns may not exist yet — non-fatal

    try:
        doc_result = supabase.table("knowledge_documents").insert(insert_payload).execute()
    except Exception:
        # Retry without assessment fields in case columns don't exist
        insert_payload.pop("discovery_value", None)
        insert_payload.pop("discovery_note", None)
        insert_payload.pop("doc_type", None)
        doc_result = supabase.table("knowledge_documents").insert(insert_payload).execute()

    doc_id = doc_result.data[0]["id"]

    # 5. Embed and store chunks
    try:
        vectors = _embed_chunks(chunks)
        chunk_records = [
            {
                "knowledge_document_id": doc_id,
                "user_id": user_id,
                "content": chunks[i],
                "embedding": vectors[i],
            }
            for i in range(min(len(chunks), len(vectors)))
            if vectors[i] is not None
        ]
        skipped = len(chunks) - len(chunk_records)
        if skipped:
            logger.warning(
                "Skipped %d chunk(s) without embeddings for doc=%s",
                skipped, doc_id,
            )
        if chunk_records:
            supabase.table("knowledge_chunks").insert(chunk_records).execute()

        logger.info(
            "KB upload complete — file=%s doc_id=%s chunks=%d tabular=%s",
            filename, doc_id, len(chunk_records), is_tabular,
        )

        # Fire-and-forget insight extraction for non-tabular docs. Tabular
        # files (CSV/Excel) go through analyze_data instead — surfacing
        # insights from rows of numbers isn't meaningful.
        if not is_tabular and chunk_records:
            try:
                schedule_extraction(
                    knowledge_document_id=doc_id,
                    project_id=project_id,
                    user_id=user_id,
                    filename=filename,
                    full_text=text,
                )
            except Exception as e:
                logger.warning("Could not schedule insight extraction: %s", e)

        return {
            "success": True,
            "document_id": doc_id,
            "chunks": len(chunk_records),
            "tabular": is_tabular,
            "discovery_value": assessment["value"],
            "discovery_note":  assessment.get("note", ""),
            "doc_type":        assessment.get("doc_type", ""),
        }

    except Exception as e:
        logger.error("Embedding failed — file=%s doc_id=%s: %s", filename, doc_id, e, exc_info=True)
        supabase.table("knowledge_documents").delete().eq("id", doc_id).execute()
        raise HTTPException(status_code=500, detail=f"Embedding generation failed: {e}")


# ── Backfill endpoint ─────────────────────────────────────────────────────────

@router.post("/assess")
async def assess_knowledge_documents(project_id: str, user_id: str = Depends(get_user_id)):
    """Re-assess all unassessed documents in a project.
    Reads the first chunk of each doc that has no discovery_value yet,
    runs the LLM classifier, and patches the row. Safe to call multiple times.
    """
    supabase = get_supabase()

    # Fetch docs with no assessment yet
    try:
        result = (
            supabase.table("knowledge_documents")
            .select("id, filename")
            .eq("project_id", project_id)
            .eq("user_id", user_id)
            .is_("discovery_value", "null")
            .execute()
        )
    except Exception:
        # Column doesn't exist yet — migration not run
        return {"assessed": 0, "skipped": 0, "message": "Run the DB migration first."}

    docs = result.data or []
    assessed = 0
    skipped = 0

    for doc in docs:
        doc_id = doc["id"]
        # Reconstruct text from stored RAG chunks (ordered, no overlap dedup needed
        # for a ~1500 char assessment sample)
        try:
            chunks_res = (
                supabase.table("knowledge_chunks")
                .select("content")
                .eq("knowledge_document_id", doc_id)
                .eq("user_id", user_id)
                .order("created_at")
                .limit(5)
                .execute()
            )
            chunk_rows = chunks_res.data or []
            if not chunk_rows:
                skipped += 1
                continue
            sample_text = "\n\n".join(r["content"] for r in chunk_rows)
        except Exception as e:
            logger.warning("Could not fetch chunks for doc %s: %s", doc_id, e)
            skipped += 1
            continue

        assessment = await _assess_discovery_value(sample_text)

        try:
            supabase.table("knowledge_documents").update({
                "discovery_value": assessment["value"],
                "discovery_note":  assessment.get("note", ""),
                "doc_type":        assessment.get("doc_type", ""),
            }).eq("id", doc_id).eq("user_id", user_id).execute()
            assessed += 1
        except Exception as e:
            logger.warning("Could not update assessment for doc %s: %s", doc_id, e)
            skipped += 1

    return {"assessed": assessed, "skipped": skipped}


# ── Read endpoints ────────────────────────────────────────────────────────────

@router.get("/")
async def list_knowledge_documents(project_id: str, user_id: str = Depends(get_user_id)):
    supabase = get_supabase()
    result = (
        supabase.table("knowledge_documents")
        .select("*")
        .eq("project_id", project_id)
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data


@router.get("/{doc_id}")
async def get_knowledge_document(doc_id: str, user_id: str = Depends(get_user_id)):
    supabase = get_supabase()
    result = (
        supabase.table("knowledge_documents")
        .select("*")
        .eq("id", doc_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Document not found")
    return result.data[0]


@router.get("/{doc_id}/url")
async def get_knowledge_document_url(doc_id: str, user_id: str = Depends(get_user_id)):
    supabase = get_supabase()
    result = (
        supabase.table("knowledge_documents")
        .select("storage_path, filename, file_type")
        .eq("id", doc_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not result.data or not result.data[0].get("storage_path"):
        raise HTTPException(status_code=404, detail="Original file not found in storage")

    storage_path = result.data[0]["storage_path"]
    try:
        signed = supabase.storage.from_("knowledge-files").create_signed_url(storage_path, 3600)
        return {
            "url": signed.get("signedURL") or signed.get("signed_url") or signed,
            "filename": result.data[0]["filename"],
            "file_type": result.data[0]["file_type"],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not generate signed URL: {e}")


@router.get("/{doc_id}/chunks")
async def get_knowledge_chunks(doc_id: str, user_id: str = Depends(get_user_id)):
    supabase = get_supabase()
    result = (
        supabase.table("knowledge_chunks")
        .select("id, content, created_at")
        .eq("knowledge_document_id", doc_id)
        .eq("user_id", user_id)
        .order("created_at")
        .execute()
    )
    return result.data


@router.delete("/{doc_id}")
async def delete_knowledge_document(doc_id: str, user_id: str = Depends(get_user_id)):
    supabase = get_supabase()
    supabase.table("knowledge_documents").delete().eq("id", doc_id).eq("user_id", user_id).execute()
    return {"success": True}
