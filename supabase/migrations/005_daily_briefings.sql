-- ============================================
-- LexQuant — Migration 005: Daily Briefings
-- AI-generated per-user morning briefing combining tracked cases,
-- fresh judgments, news, and watchlist items.
-- Run this in Supabase SQL Editor after 004_us_opinions.sql
-- ============================================

CREATE TABLE IF NOT EXISTS daily_briefings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  briefing_date DATE NOT NULL,            -- IST date the briefing covers
  body TEXT NOT NULL,
  provider TEXT,                          -- 'gemini' | 'anthropic' | 'ollama'
  model TEXT,                             -- e.g. 'gemini-2.0-flash' | 'claude-haiku-4-5-20251001'
  input_signals JSONB DEFAULT '{}'::jsonb, -- counts: { tracked_cases: N, judgments: N, news: N, watchlist: N }
  prompt_chars INT,
  output_chars INT,
  duration_ms INT,
  generated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_briefings_user_date
  ON daily_briefings(user_id, briefing_date);
CREATE INDEX IF NOT EXISTS idx_daily_briefings_user_recent
  ON daily_briefings(user_id, generated_at DESC);

ALTER TABLE daily_briefings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own briefings"
  ON daily_briefings FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role full access on daily_briefings"
  ON daily_briefings FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
