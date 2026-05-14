-- Migration: document_chunks table for PM document semantic search
-- Run this in the Supabase SQL Editor

-- pgvector is already enabled (required by knowledge_chunks)

-- PM document chunks — mirrors knowledge_chunks but linked to documents table
create table if not exists document_chunks (
    id            uuid        primary key default gen_random_uuid(),
    document_id   uuid        not null references documents(id) on delete cascade,
    project_id    uuid        not null,
    user_id       text        not null,
    content       text        not null,
    embedding     vector(768),
    chunk_index   integer     not null default 0,
    created_at    timestamptz not null default now()
);

create index if not exists idx_document_chunks_document_id
    on document_chunks(document_id);

create index if not exists idx_document_chunks_project_user
    on document_chunks(project_id, user_id);

create index if not exists idx_document_chunks_embedding
    on document_chunks using ivfflat (embedding vector_cosine_ops)
    with (lists = 100);

alter table document_chunks enable row level security;

-- Users can only access their own chunks (service key bypasses RLS)
create policy "Users access own document chunks"
    on document_chunks for all
    using (user_id = auth.uid()::text);


-- Semantic similarity search over PM document chunks
create or replace function match_document_chunks(
    query_embedding vector(768),
    match_threshold  float,
    match_count      int,
    p_project_id     uuid
)
returns table(
    id          uuid,
    document_id uuid,
    project_id  uuid,
    content     text,
    similarity  float
)
language sql stable
as $$
    select
        dc.id,
        dc.document_id,
        dc.project_id,
        dc.content,
        1 - (dc.embedding <=> query_embedding) as similarity
    from document_chunks dc
    where
        dc.project_id = p_project_id
        and dc.embedding is not null
        and (1 - (dc.embedding <=> query_embedding)) > match_threshold
    order by dc.embedding <=> query_embedding
    limit match_count;
$$;
