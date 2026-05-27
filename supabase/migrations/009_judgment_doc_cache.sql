-- ============================================
-- LexQuant — Migration 009: judgment doc cache
-- Persists the raw IK /doc/<tid>/ payload on the judgments row so the
-- research view can be served entirely from Postgres on repeat hits
-- instead of paying for the IK API call every time. We store the whole
-- IKDocResponse as JSONB (so parser drift can't desync the cache) and
-- track when it was fetched. Refresh on demand via a query flag.
-- Run this in Supabase SQL Editor after 008_match_chunks_fn.sql.
-- ============================================

ALTER TABLE judgments
  ADD COLUMN IF NOT EXISTS raw_doc JSONB,
  ADD COLUMN IF NOT EXISTS doc_cached_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_judgments_doc_cached_at
  ON judgments(doc_cached_at);
