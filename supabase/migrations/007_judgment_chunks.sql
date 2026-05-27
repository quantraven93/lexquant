-- ============================================
-- LexQuant — Migration 007: pgvector + judgment chunks
-- Adds vector embeddings of IK-paragraph-level chunks for semantic
-- search over the judgments corpus. One IK structured paragraph
-- (Facts/Issue/PetArg/RespArg/Precedent/Section/CDiscource/Conclusion/Other)
-- maps to one chunk, preserving the structure tag for per-section filtering.
-- Embeddings are voyage-law-2 (1024d, law-tuned, 16K context, cosine).
-- Run this in Supabase SQL Editor after 006_judgment_citations.sql.
-- ============================================

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS judgment_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ik_tid BIGINT NOT NULL REFERENCES judgments(ik_tid) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  content TEXT NOT NULL,
  structure_type TEXT,
  token_count INT NOT NULL,
  embedding vector(1024),
  embedded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (ik_tid, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_judgment_chunks_tid
  ON judgment_chunks(ik_tid);

CREATE INDEX IF NOT EXISTS idx_judgment_chunks_structure
  ON judgment_chunks(structure_type);

CREATE INDEX IF NOT EXISTS idx_judgment_chunks_embedding
  ON judgment_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Track per-judgment chunking status so the lazy /research path
-- and the backfill script can both skip already-chunked judgments.
ALTER TABLE judgments
  ADD COLUMN IF NOT EXISTS chunks_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_judgments_chunks_at
  ON judgments(chunks_at) WHERE chunks_at IS NULL;

ALTER TABLE judgment_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read judgment chunks"
  ON judgment_chunks FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role full access on judgment chunks"
  ON judgment_chunks FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
