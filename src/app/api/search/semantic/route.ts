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
export const maxDuration = 30;

const MAX_LIMIT = 25;
const DEFAULT_LIMIT = 10;
const CHUNK_OVERFETCH_MULTIPLIER = 4;
const SNIPPET_CHARS = 320;

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

function parseStructureTypes(raw: string | null): string[] | null {
  if (!raw) return null;
  const tokens = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => (IK_STRUCTURE_TYPES as readonly string[]).includes(s));
  return tokens.length ? tokens : null;
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

  const limit = Math.min(
    Math.max(
      Number.parseInt(url.searchParams.get("limit") || "", 10) || DEFAULT_LIMIT,
      1,
    ),
    MAX_LIMIT,
  );
  const structureTypes = parseStructureTypes(url.searchParams.get("structure"));
  const courtCodes = parseCourtCodes(url.searchParams.get("court"));

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
  for (const r of rows) {
    const existing = byJudgment.get(r.ik_tid);
    if (existing) {
      existing.matchedChunks += 1;
      continue;
    }
    if (byJudgment.size >= limit) continue;
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

  return NextResponse.json({
    query: q,
    limit,
    structureFilter: structureTypes,
    courtFilter: courtCodes,
    results: Array.from(byJudgment.values()),
  });
}
