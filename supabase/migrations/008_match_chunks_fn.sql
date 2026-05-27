-- ============================================
-- LexQuant — Migration 008: match_judgment_chunks function
-- pgvector cosine-distance kNN with optional filters by structure type
-- and court code. Returns chunks joined to their parent judgment so the
-- API can render full-context results in one round-trip.
--
-- Index note: the HNSW index built in 007 returns ~ef_search candidates
-- BEFORE the WHERE clause is applied. With default ef_search=40, selective
-- filters (e.g. Precedent + supremecourt) can yield zero or near-zero rows
-- even when many true matches exist in the corpus. We bump ef_search to 200
-- for this function only; cost is bounded and accuracy is materially better.
-- Run this in Supabase SQL Editor after 007_judgment_chunks.sql.
-- ============================================

CREATE OR REPLACE FUNCTION match_judgment_chunks(
  query_embedding vector(1024),
  match_limit INT DEFAULT 10,
  filter_structure_types TEXT[] DEFAULT NULL,
  filter_court_codes TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  ik_tid BIGINT,
  chunk_index INT,
  content TEXT,
  structure_type TEXT,
  distance FLOAT,
  title TEXT,
  court_code TEXT,
  court_name TEXT,
  citation TEXT,
  publish_date DATE,
  source_url TEXT
)
LANGUAGE SQL
STABLE
SET hnsw.ef_search = 200
AS $$
  SELECT
    jc.ik_tid,
    jc.chunk_index,
    jc.content,
    jc.structure_type,
    (jc.embedding <=> query_embedding)::FLOAT AS distance,
    j.title,
    j.court_code,
    j.court_name,
    j.citation,
    j.publish_date,
    j.source_url
  FROM judgment_chunks jc
  JOIN judgments j ON j.ik_tid = jc.ik_tid
  WHERE jc.embedding IS NOT NULL
    AND (filter_structure_types IS NULL OR jc.structure_type = ANY(filter_structure_types))
    AND (filter_court_codes IS NULL OR j.court_code = ANY(filter_court_codes))
  ORDER BY jc.embedding <=> query_embedding
  LIMIT match_limit;
$$;

-- Authenticated users may call the function (RLS on the underlying
-- tables continues to apply via STABLE SQL).
GRANT EXECUTE ON FUNCTION match_judgment_chunks TO authenticated;
GRANT EXECUTE ON FUNCTION match_judgment_chunks TO service_role;
