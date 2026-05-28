/**
 * Re-runs stale saved searches inside the morning briefing per-user loop
 * and returns alert lines for any that have a fresh top match (≠ the
 * previous run's top tid). Bounded by a per-user wall-clock budget so
 * one greedy user can't blow the lambda.
 *
 * Skips silently when VOYAGE_API_KEY isn't set (briefing still ships
 * without the alerts section).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { embedTexts } from "@/lib/embed/voyage";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export interface SavedSearchAlertLine {
  name: string;
  query: string;
  topTitle: string;
  topCourt: string;
  topTid: number;
  distance: number;
  newSinceLastRun: number;
}

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

interface RunOptions {
  /** Hard cap on how many saved searches to (re-)run for this user. */
  maxRuns?: number;
  /** Wall-clock budget for the whole per-user loop. */
  timeBudgetMs?: number;
}

export async function runStaleSavedSearchesForUser(
  uid: string,
  supabase: SupabaseClient,
  opts: RunOptions = {},
): Promise<SavedSearchAlertLine[]> {
  if (!process.env.VOYAGE_API_KEY) return [];

  const maxRuns = opts.maxRuns ?? 3;
  const timeBudgetMs = opts.timeBudgetMs ?? 25_000;
  const startedAt = Date.now();

  const cutoff = new Date(Date.now() - ONE_DAY_MS).toISOString();

  const { data: stale, error } = await supabase
    .from("saved_searches")
    .select("id, name, query, structure_filter, court_filter, last_top_ik_tid")
    .eq("user_id", uid)
    .or(`last_run_at.is.null,last_run_at.lt.${cutoff}`)
    .order("last_run_at", { ascending: true, nullsFirst: true })
    .limit(maxRuns);

  if (error) {
    // Table may not exist yet (migration 010 unapplied). Treat as "no
    // alerts" — briefing carries on without this section.
    console.warn(
      `[Briefing] saved_searches lookup failed for ${uid}:`,
      error.message,
    );
    return [];
  }

  if (!stale || stale.length === 0) return [];

  const alerts: SavedSearchAlertLine[] = [];

  for (const s of stale) {
    if (Date.now() - startedAt >= timeBudgetMs) break;

    let queryEmbedding: number[];
    try {
      const [vec] = await embedTexts([s.query as string], "query");
      queryEmbedding = vec;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[Briefing] embed for search ${s.id} failed:`, msg);
      continue;
    }

    const { data: rows, error: rpcErr } = await supabase.rpc(
      "match_judgment_chunks",
      {
        query_embedding: JSON.stringify(queryEmbedding),
        match_limit: 10,
        filter_structure_types: s.structure_filter as string[] | null,
        filter_court_codes: s.court_filter as string[] | null,
      },
    );

    if (rpcErr) {
      console.warn(`[Briefing] RPC for search ${s.id} failed:`, rpcErr.message);
      continue;
    }

    const chunks = (rows || []) as ChunkRow[];
    if (!chunks.length) continue;

    const byJudgment = new Map<number, ChunkRow>();
    for (const r of chunks) {
      if (!byJudgment.has(r.ik_tid)) byJudgment.set(r.ik_tid, r);
    }
    const distinct = Array.from(byJudgment.values()).sort(
      (a, b) => a.distance - b.distance,
    );
    const top = distinct[0];
    const priorTopTid = (s.last_top_ik_tid as number | null) ?? null;
    const newSinceRun =
      priorTopTid === null
        ? distinct.length
        : distinct.filter((r) => r.ik_tid !== priorTopTid).length;

    // Persist bookkeeping inside the briefing run.
    await supabase
      .from("saved_searches")
      .update({
        last_run_at: new Date().toISOString(),
        last_top_distance: top.distance,
        last_top_ik_tid: top.ik_tid,
        new_matches_since_run: newSinceRun,
      })
      .eq("id", s.id);

    // Only surface as an alert when the top match changed since last
    // run — avoids briefing repeating the same "your saved search X
    // matched the same thing it matched yesterday" line every day.
    if (priorTopTid !== top.ik_tid) {
      alerts.push({
        name: s.name as string,
        query: s.query as string,
        topTitle: top.title,
        topCourt: top.court_name,
        topTid: top.ik_tid,
        distance: top.distance,
        newSinceLastRun: newSinceRun,
      });
    }
  }

  return alerts;
}
