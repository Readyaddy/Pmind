-- Phase 4: Cross-project AI Search
-- Run in Supabase SQL Editor AFTER phase1/phase2 migrations

-- Full-text search index on documents
create index if not exists documents_content_fts
  on documents using gin(to_tsvector('english', coalesce(content::text, '')));

-- Cross-project vector search (all knowledge chunks for a user)
create or replace function match_all_knowledge_chunks(
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  p_user_id text
)
returns table (
  id uuid,
  content text,
  similarity float,
  knowledge_document_id uuid,
  project_id uuid
)
language sql stable as $$
  select
    kc.id,
    kc.content,
    1 - (kc.embedding <=> query_embedding) as similarity,
    kc.knowledge_document_id,
    kd.project_id
  from knowledge_chunks kc
  join knowledge_documents kd on kd.id = kc.knowledge_document_id
  where kc.user_id = p_user_id
    and 1 - (kc.embedding <=> query_embedding) > match_threshold
  order by kc.embedding <=> query_embedding
  limit match_count;
$$;
