-- ============================================
-- LexQuant — Migration 004: US Opinions
-- Mirror of `judgments` for US federal courts via CourtListener API.
-- Run this in Supabase SQL Editor after 003_watchlist.sql
-- ============================================

CREATE TABLE IF NOT EXISTS us_opinions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cl_id BIGINT UNIQUE NOT NULL,           -- CourtListener opinion cluster id
  cluster_id BIGINT,
  court_id TEXT NOT NULL,                 -- 'scotus' | 'ca1' | 'cadc' | ...
  court_name TEXT NOT NULL,
  case_name TEXT NOT NULL,
  citations TEXT[] DEFAULT '{}',          -- ['123 U.S. 456', ...]
  date_filed DATE,
  judge TEXT,
  snippet TEXT,                           -- search-result snippet, HTML-stripped
  status TEXT,                            -- 'Published' | 'Unpublished' | etc.
  absolute_url TEXT,                      -- /opinion/<id>/.../
  source_url TEXT,                        -- https://www.courtlistener.com<absolute_url>
  raw_data JSONB DEFAULT '{}'::jsonb,
  ingested_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_us_opinions_court ON us_opinions(court_id);
CREATE INDEX IF NOT EXISTS idx_us_opinions_filed ON us_opinions(date_filed DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_us_opinions_ingested ON us_opinions(ingested_at DESC);

-- RLS: opinions are public-domain; authenticated users can read
ALTER TABLE us_opinions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read US opinions"
  ON us_opinions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role full access on us_opinions"
  ON us_opinions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
