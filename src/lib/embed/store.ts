/**
 * Orchestrates: IK research view → chunker → Voyage embeddings → Supabase upsert.
 *
 * Idempotent on (ik_tid, chunk_index) via the unique constraint. Sets
 * `judgments.chunks_at = now()` on success so future callers can skip.
 *
 * Batching: Voyage accepts up to 128 inputs / ~120K tokens per call.
 * We send chunks in batches of EMBED_BATCH; in practice no judgment
 * has produced more than ~120 chunks so this is usually one call.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { getResearchView } from "@/lib/ik/doc";
import type { ParsedResearchView } from "@/lib/ik/types";
import { chunkResearchView, type JudgmentChunk } from "./chunker";
import { embedTexts } from "./voyage";

const EMBED_BATCH = 64;

export interface EmbedResult {
  tid: number;
  status: "embedded" | "skipped" | "no-chunks" | "missing-row";
  chunkCount: number;
  tokenCount: number;
}

interface EmbedOptions {
  force?: boolean;
  /** Pre-fetched view — pass when the caller already paid for the IK doc call. */
  view?: ParsedResearchView;
}

export async function embedJudgment(
  tid: number,
  opts: EmbedOptions = {},
): Promise<EmbedResult> {
  const supabase = createAdminClient();

  // Always confirm the parent judgments row exists. If it doesn't, the
  // judgment_chunks FK would fail AFTER we've already paid Voyage —
  // bail early. Forced re-embeds still need the row to exist.
  const { data: existing, error: existingErr } = await supabase
    .from("judgments")
    .select("chunks_at")
    .eq("ik_tid", tid)
    .maybeSingle();
  if (existingErr) {
    throw new Error(`judgments lookup failed: ${existingErr.message}`);
  }
  if (!existing) {
    console.warn(
      `[embed] tid=${tid} has no judgments row — skipping (would FK-fail)`,
    );
    return { tid, status: "missing-row", chunkCount: 0, tokenCount: 0 };
  }
  if (!opts.force && existing.chunks_at) {
    return { tid, status: "skipped", chunkCount: 0, tokenCount: 0 };
  }

  const view = opts.view ?? (await getResearchView(tid));
  const chunks = chunkResearchView(view);

  if (!chunks.length) {
    const { error } = await supabase
      .from("judgments")
      .update({ chunks_at: new Date().toISOString() })
      .eq("ik_tid", tid);
    if (error) {
      throw new Error(
        `chunks_at update (no-chunks path) failed: ${error.message}`,
      );
    }
    return { tid, status: "no-chunks", chunkCount: 0, tokenCount: 0 };
  }

  const embeddings: number[][] = [];
  for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
    const batch = chunks.slice(i, i + EMBED_BATCH);
    const vectors = await embedTexts(
      batch.map((c) => c.content),
      "document",
    );
    embeddings.push(...vectors);
  }
  if (embeddings.length !== chunks.length) {
    throw new Error(
      `Voyage returned ${embeddings.length} embeddings for ${chunks.length} chunks (tid=${tid})`,
    );
  }

  // On force re-embed, delete prior chunks first so a smaller new
  // chunk set doesn't leave orphans with stale content/embeddings.
  if (opts.force) {
    const { error: delErr } = await supabase
      .from("judgment_chunks")
      .delete()
      .eq("ik_tid", tid);
    if (delErr) {
      throw new Error(`force-delete prior chunks failed: ${delErr.message}`);
    }
  }

  const now = new Date().toISOString();
  // pgvector accepts a stringified array literal like "[0.1,0.2,...]"
  // via PostgREST — avoids any ambiguity over JSON encoding the column.
  const rows = chunks.map((c: JudgmentChunk, i) => ({
    ik_tid: tid,
    chunk_index: c.chunkIndex,
    content: c.content,
    structure_type: c.structureType,
    token_count: c.tokenCount,
    embedding: JSON.stringify(embeddings[i]),
    embedded_at: now,
  }));

  const { error: upsertErr } = await supabase
    .from("judgment_chunks")
    .upsert(rows, { onConflict: "ik_tid,chunk_index" });
  if (upsertErr) throw new Error(`chunk upsert failed: ${upsertErr.message}`);

  const { error: markErr } = await supabase
    .from("judgments")
    .update({ chunks_at: now })
    .eq("ik_tid", tid);
  if (markErr) {
    // Chunks are written but the marker isn't — next caller will re-embed.
    // Surface this as an error so the caller can log/retry rather than
    // silently double-billing Voyage on the next page view.
    throw new Error(`chunks_at marker update failed: ${markErr.message}`);
  }

  const tokenCount = chunks.reduce((s, c) => s + c.tokenCount, 0);
  return {
    tid,
    status: "embedded",
    chunkCount: chunks.length,
    tokenCount,
  };
}
