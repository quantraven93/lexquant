/**
 * Saved Searches — POST /api/saved-searches/[id]/run
 *
 * Re-runs the saved query through the semantic-search pipeline, updates
 * the row's last_run_at / last_top_distance / last_top_ik_tid bookkeeping,
 * and returns the fresh result list. Caller can decide whether to render
 * the results inline or just rely on the updated bookkeeping fields.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { embedTexts } from "@/lib/embed/voyage";

export const dynamic = "force-dynamic";
export const maxDuration = 75;

const MATCH_LIMIT = 20;

interface ChunkRow {
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

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
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

  const { data: search, error: loadErr } = await supabase
    .from("saved_searches")
    .select("id, name, query, structure_filter, court_filter, last_top_ik_tid")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (loadErr) {
    return NextResponse.json(
      { error: "Failed to load saved search", details: loadErr.message },
      { status: 502 },
    );
  }
  if (!search) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let queryEmbedding: number[];
  try {
    const [vec] = await embedTexts([search.query as string], "query");
    queryEmbedding = vec;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Embedding failed", details: msg },
      { status: 502 },
    );
  }

  const { data: rows, error: rpcErr } = await supabase.rpc(
    "match_judgment_chunks",
    {
      query_embedding: JSON.stringify(queryEmbedding),
      match_limit: MATCH_LIMIT,
      filter_structure_types: search.structure_filter as string[] | null,
      filter_court_codes: search.court_filter as string[] | null,
    },
  );

  if (rpcErr) {
    return NextResponse.json(
      { error: "Search failed", details: rpcErr.message },
      { status: 502 },
    );
  }

  const chunks = (rows || []) as ChunkRow[];
  // Group → distinct judgments, top-by-distance retained as snippet.
  const byJudgment = new Map<number, ChunkRow>();
  for (const r of chunks) {
    if (!byJudgment.has(r.ik_tid)) byJudgment.set(r.ik_tid, r);
  }
  const results = Array.from(byJudgment.values()).sort(
    (a, b) => a.distance - b.distance,
  );

  const topDistance = results.length ? results[0].distance : null;
  const topTid = results.length ? results[0].ik_tid : null;
  const priorTopTid = (search.last_top_ik_tid as number | null) ?? null;
  // newMatchesSinceRun = how many of the current top results were not the
  // previous top. Crude but useful for "something new since last time".
  const newSinceRun =
    priorTopTid === null
      ? results.length
      : results.filter((r) => r.ik_tid !== priorTopTid).length;

  // Persist bookkeeping (admin so RLS doesn't bite when run from a cron
  // later; user-context-required reads were already done above).
  const writer = createAdminClient();
  await writer
    .from("saved_searches")
    .update({
      last_run_at: new Date().toISOString(),
      last_top_distance: topDistance,
      last_top_ik_tid: topTid,
      new_matches_since_run: newSinceRun,
    })
    .eq("id", id);

  return NextResponse.json(
    {
      results,
      topDistance,
      topTid,
      newMatchesSinceRun: newSinceRun,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
