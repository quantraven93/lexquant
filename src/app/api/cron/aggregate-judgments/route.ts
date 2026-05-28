/**
 * Cron endpoint: ingests recent judgments from Indian Kanoon
 * for top Indian courts and upserts into the `judgments` table.
 *
 * Called by Vercel Cron daily (see vercel.json) and manual POST.
 * Security: requires CRON_SECRET in Authorization header.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchJudgmentsForAllCourts,
  type IKCourtCode,
} from "@/lib/courts/ik-judgments";
import { ingestNews } from "@/lib/news/ingest";
import { embedJudgment } from "@/lib/embed/store";

export const maxDuration = 60;

// Backfill bookkeeping — bound the loop both by tid count AND by wall-clock
// so we never blow the lambda budget. The remaining backlog rolls over to
// the next day's cron + organic /research views.
const CHUNK_BACKFILL_MAX_TIDS = 8;
const CHUNK_BACKFILL_TIME_BUDGET_MS = 40_000;

const DEFAULT_COURTS: IKCourtCode[] = [
  "supremecourt",
  "bombay",
  "delhi",
  "chennai",
  "bangalore",
  "allahabad",
  "madhyapradesh",
];

async function ingestJudgments() {
  const startTime = Date.now();
  const supabase = createAdminClient();

  // Look back 2 days — IK indexing has overnight lag
  const toDate = new Date();
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - 2);

  const fromStr = fromDate.toISOString().slice(0, 10);
  const toStr = toDate.toISOString().slice(0, 10);
  console.log(
    `[Judgments] Ingesting ${DEFAULT_COURTS.length} courts ${fromStr} → ${toStr}`,
  );

  const byCourt = await fetchJudgmentsForAllCourts({
    courts: DEFAULT_COURTS,
    fromDate,
    toDate,
    pagesPerCourt: 1,
  });

  let upserted = 0;
  let errors = 0;
  const breakdown: Record<string, number> = {};

  for (const [court, judgments] of byCourt.entries()) {
    breakdown[court] = judgments.length;
    if (!judgments.length) continue;

    const { data, error } = await supabase
      .from("judgments")
      .upsert(judgments, { onConflict: "ik_tid", ignoreDuplicates: false })
      .select("id");

    if (error) {
      errors++;
      console.error(`[Judgments] Upsert failed for ${court}:`, error.message);
      continue;
    }

    upserted += data?.length || 0;
    console.log(
      `[Judgments] ${court}: ${judgments.length} fetched, ${data?.length || 0} upserted`,
    );
  }

  const duration = Date.now() - startTime;
  console.log(
    `[Judgments] Done in ${duration}ms: ${upserted} upserted, ${errors} errors`,
  );

  return {
    success: true,
    courts: DEFAULT_COURTS.length,
    upserted,
    errors,
    breakdown,
    duration,
    range: { from: fromStr, to: toStr },
  };
}

interface ChunkBackfillResult {
  attempted: number;
  embedded: number;
  skipped: number;
  errors: number;
  remainingAfter: number;
  bailedOnTime: boolean;
  durationMs: number;
}

async function backfillPendingChunks(): Promise<ChunkBackfillResult> {
  const startedAt = Date.now();
  const supabase = createAdminClient();

  const { data: pending, error } = await supabase
    .from("judgments")
    .select("ik_tid")
    .is("chunks_at", null)
    .order("publish_date", { ascending: false, nullsFirst: false })
    .limit(CHUNK_BACKFILL_MAX_TIDS);

  if (error) {
    // Likely migration 007 not applied yet — column doesn't exist.
    // Log + return zero; the lazy /research path will keep limping along.
    console.warn(`[Chunks] Backlog query failed: ${error.message}`);
    return {
      attempted: 0,
      embedded: 0,
      skipped: 0,
      errors: 1,
      remainingAfter: 0,
      bailedOnTime: false,
      durationMs: Date.now() - startedAt,
    };
  }

  const tids = (pending || []).map((r) => r.ik_tid as number);
  let attempted = 0;
  let embedded = 0;
  let skipped = 0;
  let errors = 0;
  let bailedOnTime = false;

  for (const tid of tids) {
    if (Date.now() - startedAt >= CHUNK_BACKFILL_TIME_BUDGET_MS) {
      bailedOnTime = true;
      break;
    }
    attempted++;
    try {
      const res = await embedJudgment(tid);
      if (res.status === "embedded") embedded++;
      else skipped++;
    } catch (err) {
      errors++;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[Chunks] embed tid=${tid} failed: ${msg}`);
    }
  }

  // Re-query remaining for caller visibility (cheap, count-only).
  const { count: remainingAfter } = await supabase
    .from("judgments")
    .select("*", { count: "exact", head: true })
    .is("chunks_at", null);

  return {
    attempted,
    embedded,
    skipped,
    errors,
    remainingAfter: remainingAfter || 0,
    bailedOnTime,
    durationMs: Date.now() - startedAt,
  };
}

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const judgments = await ingestJudgments();
    // News ingest runs in the same cron to stay within Hobby tier's
    // 2-cron cap. Failures here are logged but do not abort the run.
    let news: Awaited<ReturnType<typeof ingestNews>> | { error: string };
    try {
      news = await ingestNews();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[News] Ingest failed inside judgments cron:", msg);
      news = { error: msg };
    }

    // Chunk backfill — drains the embed backlog for judgments whose
    // chunks_at is still NULL. Bounded by tid count + wall-clock so it
    // never blows the lambda budget; remaining backlog rolls forward.
    // Skipped entirely if VOYAGE_API_KEY isn't set.
    let chunks: ChunkBackfillResult | { skipped: string };
    if (!process.env.VOYAGE_API_KEY) {
      chunks = { skipped: "VOYAGE_API_KEY not set" };
    } else {
      try {
        chunks = await backfillPendingChunks();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[Chunks] Backfill failed inside cron:", msg);
        chunks = { skipped: `error: ${msg}` };
      }
    }

    return NextResponse.json({ judgments, news, chunks });
  } catch (err) {
    console.error("[Judgments] Fatal:", err);
    return NextResponse.json(
      { error: "Internal error", details: String(err) },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}
