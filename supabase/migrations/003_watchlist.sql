-- ============================================
-- LexQuant — Migration 003: Watchlist
-- Public-case watchlist (separate from `cases`). User bookmarks
-- judgments, news articles, court matters, or arbitrary URLs that
-- they want to FOLLOW but not actively TRACK (no alerts, no auto-refresh).
-- Run this in Supabase SQL Editor after 002_news_items.sql
-- ============================================

CREATE TABLE IF NOT EXISTS watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  url TEXT NOT NULL,
  note TEXT DEFAULT '',
  source_type TEXT,                     -- 'judgment' | 'news' | 'case' | 'url'
  source_ref TEXT,                      -- ik_tid for judgments, news_items.id for news, etc.
  added_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_watchlist_user_url ON watchlist(user_id, url);
CREATE INDEX IF NOT EXISTS idx_watchlist_user ON watchlist(user_id, added_at DESC);

ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own watchlist"
  ON watchlist FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert into own watchlist"
  ON watchlist FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own watchlist"
  ON watchlist FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete from own watchlist"
  ON watchlist FOR DELETE USING (auth.uid() = user_id);
