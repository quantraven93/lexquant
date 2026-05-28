-- ============================================
-- LexQuant — Migration 010: saved_searches
-- Per-user persistent semantic-search queries. Each row captures the
-- query text + the structure/court filters and tracks when it was last
-- run + the best (lowest cosine distance) match at that time. Future
-- alerts hook checks last_top_distance against fresh runs to decide
-- whether to notify on new matches.
-- Run this in Supabase SQL Editor after 009_judgment_doc_cache.sql.
-- ============================================

CREATE TABLE IF NOT EXISTS saved_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  query TEXT NOT NULL,
  structure_filter TEXT[] DEFAULT NULL,
  court_filter TEXT[] DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_run_at TIMESTAMPTZ,
  last_top_distance FLOAT,
  last_top_ik_tid BIGINT,
  -- Bookkeeping for future alert delivery (filled by morning briefing or
  -- a future alerts cron). Currently surfaced in the UI only.
  new_matches_since_run INT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_saved_searches_user_id
  ON saved_searches(user_id);

CREATE INDEX IF NOT EXISTS idx_saved_searches_last_run_at
  ON saved_searches(last_run_at);

ALTER TABLE saved_searches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own saved searches"
  ON saved_searches FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own saved searches"
  ON saved_searches FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own saved searches"
  ON saved_searches FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users delete own saved searches"
  ON saved_searches FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Service role full access on saved searches"
  ON saved_searches FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
