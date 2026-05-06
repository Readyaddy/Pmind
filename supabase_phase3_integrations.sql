-- Phase 3: User Integrations (Jira, Linear)
-- Run this in the Supabase SQL Editor

CREATE TABLE IF NOT EXISTS user_integrations (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          text NOT NULL,
  integration_type text NOT NULL CHECK (integration_type IN ('jira', 'linear')),
  config           jsonb NOT NULL DEFAULT '{}',
  is_active        boolean DEFAULT true,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now(),
  UNIQUE(user_id, integration_type)
);

ALTER TABLE user_integrations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_integrations'
      AND policyname = 'Users manage own integrations'
  ) THEN
    CREATE POLICY "Users manage own integrations"
      ON user_integrations FOR ALL
      USING (user_id = auth.uid()::text);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

DROP TRIGGER IF EXISTS update_user_integrations_updated_at ON user_integrations;
CREATE TRIGGER update_user_integrations_updated_at
  BEFORE UPDATE ON user_integrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
