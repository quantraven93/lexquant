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
  status: "embedded" | "skipped" | "no-chunks";
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

  if (!opts.force) {
    const { data: existing } = await supabase
      .from("judgments")
      .select("chunks_at")
      .eq("ik_tid", tid)
      .maybeSingle();
    if (existing?.chunks_at) {
      return { tid, status: "skipped", chunkCount: 0, tokenCount: 0 };
    }
  }

  const view = opts.view ?? (await getResearchView(tid));
  const chunks = chunkResearchView(view);

  if (!chunks.length) {
    await supabase
      .from("judgments")
      .update({ chunks_at: new Date().toISOString() })
      .eq("ik_tid", tid);
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

  const { error } = await supabase
    .from("judgment_chunks")
    .upsert(rows, { onConflict: "ik_tid,chunk_index" });
  if (error) throw new Error(`chunk upsert failed: ${error.message}`);

  await supabase.from("judgments").update({ chunks_at: now }).eq("ik_tid", tid);

  const tokenCount = chunks.reduce((s, c) => s + c.tokenCount, 0);
  return {
    tid,
    status: "embedded",
    chunkCount: chunks.length,
    tokenCount,
  };
}
