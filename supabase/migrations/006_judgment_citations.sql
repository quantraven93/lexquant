-- ============================================
-- LexQuant — Migration 006: Judgment citations
-- Adds the citation graph backing — which judgments a given one cites,
-- and which later judgments have cited it. Populated lazily by the
-- /research/[tid] page on first view.
-- Run this in Supabase SQL Editor after 005_daily_briefings.sql
-- ============================================

ALTER TABLE judgments
  ADD COLUMN IF NOT EXISTS cites_tids INT[] DEFAULT '{}'::INT[],
  ADD COLUMN IF NOT EXISTS cited_by_tids INT[] DEFAULT '{}'::INT[],
  ADD COLUMN IF NOT EXISTS citations_fetched_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_judgments_cites_tids
  ON judgments USING GIN (cites_tids);

CREATE INDEX IF NOT EXISTS idx_judgments_cited_by_tids
  ON judgments USING GIN (cited_by_tids);
