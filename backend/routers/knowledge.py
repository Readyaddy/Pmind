import logging
import io
import uuid
import os
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from deps import get_supabase, get_user_id
from google import genai
import PyPDF2
import docx

logger = logging.getLogger(__name__)
router = APIRouter()

def get_gemini_client():
    api_key = os.getenv("GOOGLE_API_KEY", "")
    return genai.Client(api_key=api_key)

def chunk_text(text: str, chunk_size: int = 1000, overlap: int = 200) -> list[str]:
    # Simple character-based chunking
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        start += chunk_size - overlap
    return chunks

async def extract_text_from_file(file: UploadFile) -> str:
    content = await file.read()
    filename = (file.filename or "").lower()

    if filename.endswith(".pdf"):
        reader = PyPDF2.PdfReader(io.BytesIO(content))
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    elif filename.endswith(".docx"):
        doc = docx.Document(io.BytesIO(content))
        return "\n".join(para.text for para in doc.paragraphs)
    elif filename.endswith(".txt"):
        return content.decode("utf-8", errors="ignore")
    else:
        raise HTTPException(status_code=400, detail="Unsupported file format. Please upload PDF, DOCX, or TXT.")

@router.post("/")
async def upload_knowledge_document(
    project_id: str = Form(...),
    file: UploadFile = File(...),
    user_id: str = Depends(get_user_id)
):
    supabase = get_supabase()

    # 1. Read raw bytes first (we need them for both storage upload and text extraction)
    raw_bytes = await file.read()
    await file.seek(0)  # reset so extract_text_from_file can read again

    # 2. Extract Text
    text = await extract_text_from_file(file)
    if not text.strip():
        raise HTTPException(status_code=400, detail="Could not extract text from file.")

    # 3. Upload original file to Supabase Storage
    storage_path = f"{user_id}/{project_id}/{file.filename}"
    try:
        supabase.storage.from_("knowledge-files").upload(
            path=storage_path,
            file=raw_bytes,
            file_options={"content-type": file.content_type or "application/octet-stream", "upsert": "true"}
        )
    except Exception as e:
        logger.warning("Storage upload failed (non-fatal) — file=%s: %s", file.filename, e)
        storage_path = None  # Non-fatal – continue without storage

    # 4. Save Document Record
    doc_result = (
        supabase.table("knowledge_documents")
        .insert({
            "project_id": project_id,
            "user_id": user_id,
            "filename": file.filename,
            "file_type": file.content_type or "text/plain",
            "storage_path": storage_path,
        })
        .execute()
    )
    doc_id = doc_result.data[0]["id"]
    
    # 3. Chunk Text
    chunks = chunk_text(text)
    
    # 4. Generate Embeddings & Save Chunks
    client = get_gemini_client()
    try:
        from google.genai import types
        embeddings = client.models.embed_content(
            model='gemini-embedding-2',
            contents=chunks,
            config=types.EmbedContentConfig(output_dimensionality=768)
        )
        
        chunk_records = []
        # Handle cases where embeddings might be returned differently based on API version
        emb_list = embeddings.embeddings if hasattr(embeddings, 'embeddings') else embeddings
        
        for i, emb_obj in enumerate(emb_list):
            # Extract vector values
            vector = emb_obj.values if hasattr(emb_obj, 'values') else emb_obj
            chunk_records.append({
                "knowledge_document_id": doc_id,
                "user_id": user_id,
                "content": chunks[i],
                "embedding": vector
            })
            
        if chunk_records:
            supabase.table("knowledge_chunks").insert(chunk_records).execute()
            
        return {"success": True, "document_id": doc_id, "chunks": len(chunk_records)}
    except Exception as e:
        logger.error("Embedding generation failed — file=%s doc_id=%s: %s", file.filename, doc_id, e, exc_info=True)
        # Rollback document if chunks fail
        supabase.table("knowledge_documents").delete().eq("id", doc_id).execute()
        raise HTTPException(status_code=500, detail=f"Embedding generation failed: {str(e)}")

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
    """Returns a short-lived signed URL for the original uploaded file."""
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
        raise HTTPException(status_code=500, detail=f"Could not generate signed URL: {str(e)}")

@router.get("/{doc_id}/chunks")
async def get_knowledge_chunks(doc_id: str, user_id: str = Depends(get_user_id)):
    supabase = get_supabase()
    result = (
        supabase.table("knowledge_chunks")
        .select("id, content, created_at")  # exclude embedding vector - too large
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

