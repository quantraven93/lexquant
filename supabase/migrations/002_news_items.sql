-- ============================================
-- LexQuant — Migration 002: News Items
-- RSS aggregator for legal news (LiveLaw, Bar & Bench,
-- LawBeat, SCC Blog, The Leaflet)
-- Run this in Supabase SQL Editor after 001_judgments.sql
-- ============================================

CREATE TABLE IF NOT EXISTS news_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guid TEXT UNIQUE NOT NULL,             -- RSS guid or canonical link, dedup key
  source TEXT NOT NULL,                  -- 'livelaw' | 'barandbench' | 'lawbeat' | 'scc-blog' | 'leaflet'
  source_name TEXT NOT NULL,             -- 'LiveLaw', 'Bar & Bench', etc.
  title TEXT NOT NULL,
  link TEXT NOT NULL,
  summary TEXT,                          -- description / content snippet (HTML stripped)
  author TEXT,
  categories TEXT[] DEFAULT '{}',        -- if available from feed
  published_at TIMESTAMPTZ,
  ingested_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_news_source ON news_items(source);
CREATE INDEX IF NOT EXISTS idx_news_published_at ON news_items(published_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_news_ingested_at ON news_items(ingested_at DESC);

-- RLS: legal news is public-domain; all authenticated users can read
ALTER TABLE news_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read news"
  ON news_items FOR SELECT
  TO authenticated
  USING (true);

-- Service role has full access (cron writes)
CREATE POLICY "Service role full access on news"
  ON news_items FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
