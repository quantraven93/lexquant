-- ============================================
-- LexQuant — Migration 012: honest refresh signal on `cases`
-- `last_checked_at` was written on every refresh attempt, including the
-- ones where the court fetch returned nothing, so a permanently broken
-- pipeline still looked freshly checked and the health endpoint's ecourts
-- dot stayed green. `last_fetch_ok` is written ONLY when a fetch actually
-- parsed into case fields, so the two timestamps drifting apart is the
-- signal that the scraper has stopped working.
-- The refresh code tolerates this column being absent, so applying this
-- migration is safe in either order relative to the deploy.
-- Run this in Supabase SQL Editor after 011_judgments_issue_line.sql.
-- ============================================

ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS last_fetch_ok TIMESTAMPTZ;

-- The health endpoint reads the single most recent successful fetch.
CREATE INDEX IF NOT EXISTS idx_cases_last_fetch_ok
  ON cases(last_fetch_ok DESC NULLS LAST);
