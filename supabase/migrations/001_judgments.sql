-- ============================================
-- LexQuant — Migration 001: Judgments Table
-- For Indian Kanoon ingest (Live Digest panel)
-- Run this in Supabase SQL Editor after schema.sql
-- ============================================

CREATE TABLE IF NOT EXISTS judgments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ik_tid BIGINT UNIQUE NOT NULL,         -- Indian Kanoon document ID
  doctype INTEGER,                        -- IK doctype (1000=judgment, 1001=order, 1021=HC)
  court_code TEXT NOT NULL,               -- 'supremecourt', 'bombay', 'delhi', etc.
  court_name TEXT NOT NULL,               -- 'Supreme Court of India', etc.
  title TEXT NOT NULL,
  citation TEXT,                          -- 'AIR 2024 SUPREME COURT 1881', etc.
  publish_date DATE,
  author TEXT,                            -- judge who authored opinion
  bench INTEGER[] DEFAULT '{}',           -- IK bench composition (judge IDs)
  numcites INTEGER DEFAULT 0,
  numcitedby INTEGER DEFAULT 0,
  headline TEXT,                          -- snippet (HTML stripped)
  fragment_text TEXT,
  source_url TEXT,                        -- https://indiankanoon.org/doc/<tid>/
  raw_data JSONB DEFAULT '{}'::jsonb,
  ingested_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_judgments_court_code ON judgments(court_code);
CREATE INDEX IF NOT EXISTS idx_judgments_publish_date ON judgments(publish_date DESC);
CREATE INDEX IF NOT EXISTS idx_judgments_ingested_at ON judgments(ingested_at DESC);

-- RLS: judgments are public-domain; all authenticated users can read
ALTER TABLE judgments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read judgments"
  ON judgments FOR SELECT
  TO authenticated
  USING (true);

-- Service role has full access (cron writes)
CREATE POLICY "Service role full access"
  ON judgments FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
