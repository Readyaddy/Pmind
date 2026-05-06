-- Run this in your Supabase SQL Editor

-- 1. Add storage_path column to track the file in Storage
alter table knowledge_documents add column if not exists storage_path text;

-- 2. Create the storage bucket for knowledge files
insert into storage.buckets (id, name, public)
values ('knowledge-files', 'knowledge-files', false)
on conflict (id) do nothing;

-- 3. RLS policy for storage: users can only access their own files
create policy "Users access own knowledge files"
  on storage.objects for all
  using (
    bucket_id = 'knowledge-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
