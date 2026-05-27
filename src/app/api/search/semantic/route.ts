/**
 * Semantic search over the judgment_chunks corpus.
 *
 * Pipeline: query string → Voyage embed (input_type=query) →
 * match_judgment_chunks RPC (cosine kNN, optional structure/court filters)
 * → group chunks by judgment, keep the best chunk per judgment as snippet.
 *
 * Returns at most `limit` distinct judgments. We over-fetch chunks
 * internally so a single judgment with many high-ranked chunks doesn't
 * crowd out other matches.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { embedTexts } from "@/lib/embed/voyage";
import { IK_STRUCTURE_TYPES, type IKStructureType } from "@/lib/ik/types";

export const dynamic = "force-dynamic";
// Voyage embedTexts allows up to a 60s timeout per attempt plus a 1.5s
// backoff before its single retry, so worst-case roundtrip is ~61.5s.
// maxDuration must exceed that or the lambda is killed before the retry
// can complete.
export const maxDuration = 75;

const MAX_LIMIT = 25;
const DEFAULT_LIMIT = 10;
const CHUNK_OVERFETCH_MULTIPLIER = 4;
const SNIPPET_CHARS = 320;

// Lowercase → canonical PascalCase map so URL filters can be case-insensitive
// without losing strict membership validation.
const STRUCTURE_TYPE_CANONICAL = new Map<string, string>(
  (IK_STRUCTURE_TYPES as readonly string[]).map((t) => [t.toLowerCase(), t]),
);

interface SemanticChunkRow {
  ik_tid: number;
  chunk_index: number;
  content: string;
  structure_type: string | null;
  distance: number;
  title: string;
  court_code: string;
  court_name: string;
  citation: string | null;
  publish_date: string | null;
  source_url: string;
}

interface SemanticHit {
  ikTid: number;
  title: string;
  court: string;
  courtCode: string;
  citation: string | null;
  publishDate: string | null;
  sourceUrl: string;
  bestStructureType: string | null;
  snippet: string;
  distance: number;
  matchedChunks: number;
}

function makeSnippet(content: string): string {
  if (content.length <= SNIPPET_CHARS) return content;
  return content.slice(0, SNIPPET_CHARS).replace(/\s+\S*$/, "") + "…";
}

type StructureFilterResult =
  | { ok: true; tokens: string[] | null }
  | { ok: false; invalid: string };

function parseStructureTypes(raw: string | null): StructureFilterResult {
  if (!raw) return { ok: true, tokens: null };
  const inputs = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!inputs.length) return { ok: true, tokens: null };
  const canonical: string[] = [];
  for (const t of inputs) {
    const c = STRUCTURE_TYPE_CANONICAL.get(t.toLowerCase());
    if (!c) return { ok: false, invalid: t };
    canonical.push(c);
  }
  return { ok: true, tokens: canonical };
}

function parseCourtCodes(raw: string | null): string[] | null {
  if (!raw) return null;
  const tokens = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return tokens.length ? tokens : null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  if (!q || q.length < 3) {
    return NextResponse.json(
      { error: "Query must be at least 3 characters" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.VOYAGE_API_KEY) {
    return NextResponse.json(
      { error: "Semantic search not configured (VOYAGE_API_KEY missing)" },
      { status: 503 },
    );
  }

  // Parse + validate ALL request inputs before any DB / Voyage work so an
  // invalid `?structure=...` returns 400 even when the corpus happens to
  // be empty. (Earlier ordering let corpus-emptiness mask filter errors.)
  const limitParsed = Number.parseInt(url.searchParams.get("limit") || "", 10);
  const limit = Math.min(
    Math.max(
      Number.isFinite(limitParsed) && limitParsed > 0
        ? limitParsed
        : DEFAULT_LIMIT,
      1,
    ),
    MAX_LIMIT,
  );

  const structureResult = parseStructureTypes(
    url.searchParams.get("structure"),
  );
  if (!structureResult.ok) {
    return NextResponse.json(
      {
        error: `Unknown structure filter token: "${structureResult.invalid}". Allowed (case-insensitive): ${(IK_STRUCTURE_TYPES as readonly string[]).join(", ")}`,
      },
      { status: 400 },
    );
  }
  const structureTypes = structureResult.tokens;
  const courtCodes = parseCourtCodes(url.searchParams.get("court"));

  // Empty-corpus probe: if no chunks have been embedded yet (fresh deploy
  // before backfill, or migration applied without VOYAGE_API_KEY) the
  // search will always return 0 results regardless of query. Surface this
  // distinctly so the UI can show a "corpus not yet populated" state
  // rather than the misleading "no matches" message.
  const { count: chunksCount, error: countErr } = await supabase
    .from("judgment_chunks")
    .select("*", { count: "exact", head: true });
  if (countErr) {
    console.error("[Semantic] chunk count probe failed:", countErr.message);
    return NextResponse.json(
      { error: "Corpus probe failed", details: countErr.message },
      { status: 502 },
    );
  }
  if (!chunksCount || chunksCount === 0) {
    return NextResponse.json({
      query: q,
      limit,
      structureFilter: structureTypes,
      courtFilter: courtCodes,
      chunksScanned: 0,
      truncated: false,
      droppedNewJudgments: 0,
      corpusEmpty: true,
      results: [],
    });
  }

  let queryEmbedding: number[];
  try {
    const [embedding] = await embedTexts([q], "query");
    queryEmbedding = embedding;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Semantic] embed failed:", msg);
    return NextResponse.json(
      { error: "Embedding failed", details: msg },
      { status: 502 },
    );
  }

  const matchLimit = Math.min(limit * CHUNK_OVERFETCH_MULTIPLIER, 100);

  const { data, error } = await supabase.rpc("match_judgment_chunks", {
    query_embedding: JSON.stringify(queryEmbedding),
    match_limit: matchLimit,
    filter_structure_types: structureTypes,
    filter_court_codes: courtCodes,
  });

  if (error) {
    console.error("[Semantic] RPC failed:", error.message);
    return NextResponse.json(
      { error: "Search failed", details: error.message },
      { status: 502 },
    );
  }

  const rows = (data || []) as SemanticChunkRow[];
  const byJudgment = new Map<number, SemanticHit>();
  let droppedNewJudgments = 0;
  for (const r of rows) {
    const existing = byJudgment.get(r.ik_tid);
    if (existing) {
      existing.matchedChunks += 1;
      continue;
    }
    if (byJudgment.size >= limit) {
      droppedNewJudgments += 1;
      continue;
    }
    byJudgment.set(r.ik_tid, {
      ikTid: r.ik_tid,
      title: r.title,
      court: r.court_name,
      courtCode: r.court_code,
      citation: r.citation,
      publishDate: r.publish_date,
      sourceUrl: r.source_url,
      bestStructureType: r.structure_type as IKStructureType | null,
      snippet: makeSnippet(r.content),
      distance: r.distance,
      matchedChunks: 1,
    });
  }

  // Defensive sort: Map insertion order should already reflect the
  // SQL ORDER BY distance, but a future refactor that adds intermediate
  // sorts/streams would silently re-rank. One pass costs nothing here.
  const results = Array.from(byJudgment.values()).sort(
    (a, b) => a.distance - b.distance,
  );

  return NextResponse.json(
    {
      query: q,
      limit,
      structureFilter: structureTypes,
      courtFilter: courtCodes,
      // Caller transparency: how many chunks were scanned vs returned,
      // and whether more relevant judgments existed past the limit cutoff.
      chunksScanned: rows.length,
      truncated: droppedNewJudgments > 0,
      droppedNewJudgments,
      corpusEmpty: false,
      results,
    },
    {
      // Auth-gated and per-user; never share between users / sessions.
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}
