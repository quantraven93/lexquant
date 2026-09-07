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
  IK_PAGE_SIZE,
  type IKCourtCode,
} from "@/lib/courts/ik-judgments";
import { ingestNews } from "@/lib/news/ingest";
import { embedJudgment } from "@/lib/embed/store";
import { generateMorningBriefings } from "@/lib/briefing/build";
import { generateIssueLine, isAIConfigured } from "@/lib/claude-ai";

export const maxDuration = 60;

// Route-level wall-clock guards: the briefing and chunk-backfill stages
// only start if enough lambda budget remains after the ingest stages.
const BRIEFING_MIN_REMAINING_MS = 20_000;
const CHUNKS_MIN_REMAINING_MS = 10_000;
const ROUTE_BUDGET_MS = 55_000;

// Backfill bookkeeping — bound the loop both by tid count AND by wall-clock
// so we never blow the lambda budget. The remaining backlog rolls over to
// the next day's cron + organic /research views.
const CHUNK_BACKFILL_MAX_TIDS = 8;
const CHUNK_BACKFILL_TIME_BUDGET_MS = 40_000;

/**
 * Pages of `IK_PAGE_SIZE` to pull per court per run. This is the ingest's
 * coverage/cost dial: IK bills per call, so raising it costs money. Every
 * run now reports `coverage.available` vs `coverage.fetched` so the value
 * can be chosen from real numbers instead of guessed.
 */
const PAGES_PER_COURT = 1;

/** Per-court ingest accounting, returned so truncation cannot stay silent. */
interface CourtIngestReport {
  /** Total IK holds for the window; null if IK's `found` was unparseable. */
  found: number | null;
  fetched: number;
  upserted: number;
  truncated: boolean;
  error?: string;
}

const DEFAULT_COURTS: IKCourtCode[] = [
  "supremecourt",
  "amravati",
  "telangana",
  "bombay",
  "delhi",
  "chennai",
  "karnataka",
  "allahabad",
  "madhyapradesh",
];

async function ingestJudgments() {
  const startTime = Date.now();
  const supabase = createAdminClient();

  // Look back 4 days. IK's indexing lag is not uniform across courts: over
  // 01-06 -> 03-09-2026 Allahabad carried 9,389 judgments (~100/day), yet a
  // 2-day window returned "No matching results" for it on every run, so the
  // court contributed nothing at all. Widening costs no extra API calls (the
  // page budget below is per court, not per day) and the upsert is keyed on
  // ik_tid, so re-seeing a judgment is free.
  //
  // NOTE: this only helps courts that fall UNDER the page cap. A court with
  // more than `pagesPerCourt * IK_PAGE_SIZE` hits in the window is still
  // truncated to the most recent ones, and a wider window does not change
  // which ten those are. See the `truncated` counts this route now returns.
  const toDate = new Date();
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - 4);

  const fromStr = fromDate.toISOString().slice(0, 10);
  const toStr = toDate.toISOString().slice(0, 10);
  console.log(
    `[Judgments] Ingesting ${DEFAULT_COURTS.length} courts ${fromStr} → ${toStr}`,
  );

  const byCourt = await fetchJudgmentsForAllCourts({
    courts: DEFAULT_COURTS,
    fromDate,
    toDate,
    pagesPerCourt: PAGES_PER_COURT,
  });

  let upserted = 0;
  let errors = 0;
  let availableTotal = 0;
  let fetchedTotal = 0;
  const truncatedCourts: string[] = [];
  const breakdown: Record<string, CourtIngestReport> = {};

  for (const [court, result] of byCourt.entries()) {
    const report: CourtIngestReport = {
      found: result.found,
      fetched: result.records.length,
      upserted: 0,
      truncated: result.truncated,
    };
    if (result.error) report.error = result.error;
    breakdown[court] = report;

    fetchedTotal += result.records.length;
    if (result.found !== null) availableTotal += result.found;
    if (result.truncated) truncatedCourts.push(court);

    if (!result.records.length) continue;

    const { data, error } = await supabase
      .from("judgments")
      .upsert(result.records, {
        onConflict: "ik_tid",
        ignoreDuplicates: false,
      })
      .select("id");

    if (error) {
      errors++;
      report.error = error.message;
      console.error(`[Judgments] Upsert failed for ${court}:`, error.message);
      continue;
    }

    report.upserted = data?.length || 0;
    upserted += report.upserted;
    console.log(
      `[Judgments] ${court}: IK holds ${report.found ?? "?"}, fetched ` +
        `${report.fetched}, upserted ${report.upserted}` +
        (report.truncated ? " — TRUNCATED" : ""),
    );
  }

  const duration = Date.now() - startTime;
  // The shortfall line is the point of this instrumentation: before it, an
  // ingest taking 70 of 1,650 available judgments logged as a clean success.
  if (truncatedCourts.length) {
    console.warn(
      `[Judgments] TRUNCATED ${truncatedCourts.length}/${DEFAULT_COURTS.length} ` +
        `courts (${truncatedCourts.join(", ")}): fetched ${fetchedTotal} of ` +
        `${availableTotal} available at ${PAGES_PER_COURT} page(s) x ` +
        `${IK_PAGE_SIZE}/court. Raise PAGES_PER_COURT to close the gap.`,
    );
  }
  console.log(
    `[Judgments] Done in ${duration}ms: ${upserted} upserted, ${errors} errors`,
  );

  return {
    success: true,
    courts: DEFAULT_COURTS.length,
    upserted,
    errors,
    breakdown,
    coverage: {
      available: availableTotal,
      fetched: fetchedTotal,
      truncatedCourts,
      pagesPerCourt: PAGES_PER_COURT,
      pageSize: IK_PAGE_SIZE,
    },
    duration,
    range: { from: fromStr, to: toStr },
  };
}

interface IssueLineResult {
  generated: number;
  failed: number;
  pendingSeen: number;
}

// One-line "core issue" digests for freshly ingested judgments, newest
// first. Returns {skipped} when migration 011 (issue_line column) isn't
// applied yet — the digest then simply shows titles only.
async function generateIssueLines(
  remaining: () => number,
): Promise<IssueLineResult | { skipped: string }> {
  const supabase = createAdminClient();
  const { data: pending, error } = await supabase
    .from("judgments")
    .select("id, title, headline, court_name")
    .is("issue_line", null)
    .order("ingested_at", { ascending: false, nullsFirst: false })
    .limit(25);
  if (error) {
    console.warn(`[IssueLines] query failed: ${error.message}`);
    return { skipped: `query failed: ${error.message}` };
  }

  let generated = 0;
  let failed = 0;
  for (const j of pending || []) {
    if (remaining() < 8_000) break;
    const line = await generateIssueLine({
      title: j.title,
      headline: j.headline,
      courtName: j.court_name,
    });
    if (!line) {
      failed++;
      continue;
    }
    const { error: upErr } = await supabase
      .from("judgments")
      .update({ issue_line: line })
      .eq("id", j.id);
    if (upErr) failed++;
    else generated++;
  }
  return { generated, failed, pendingSeen: (pending || []).length };
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

async function backfillPendingChunks(
  budgetMs: number = CHUNK_BACKFILL_TIME_BUDGET_MS,
): Promise<ChunkBackfillResult> {
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
    if (Date.now() - startedAt >= budgetMs) {
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

  const routeStart = Date.now();
  const remaining = () => ROUTE_BUDGET_MS - (Date.now() - routeStart);

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

    // Morning briefing — runs here (06:30 IST) right after ingest so it
    // covers the judgments fetched seconds earlier. Lives in this cron
    // because Hobby allows only 2 crons and the GH-Actions path 401s on
    // a CRON_SECRET that drifted from Vercel's.
    let briefing:
      | Awaited<ReturnType<typeof generateMorningBriefings>>
      | { skipped: string };
    if (remaining() < BRIEFING_MIN_REMAINING_MS) {
      briefing = { skipped: `low budget: ${remaining()}ms left` };
    } else {
      try {
        briefing = await generateMorningBriefings();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[Briefing] Failed inside judgments cron:", msg);
        briefing = { skipped: `error: ${msg}` };
      }
    }

    // One-liner issue digests for the freshest judgments (needs
    // ANTHROPIC_API_KEY + migration 011; both absent → clean skip).
    let issueLines: IssueLineResult | { skipped: string };
    if (!isAIConfigured()) {
      issueLines = { skipped: "AI not configured" };
    } else if (remaining() < 15_000) {
      issueLines = { skipped: `low budget: ${remaining()}ms left` };
    } else {
      try {
        issueLines = await generateIssueLines(remaining);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[IssueLines] failed inside cron:", msg);
        issueLines = { skipped: `error: ${msg}` };
      }
    }

    // Chunk backfill — drains the embed backlog for judgments whose
    // chunks_at is still NULL. Bounded by tid count + wall-clock so it
    // never blows the lambda budget; remaining backlog rolls forward.
    // Skipped entirely if VOYAGE_API_KEY isn't set.
    let chunks: ChunkBackfillResult | { skipped: string };
    if (!process.env.VOYAGE_API_KEY) {
      chunks = { skipped: "VOYAGE_API_KEY not set" };
    } else if (remaining() < CHUNKS_MIN_REMAINING_MS) {
      chunks = { skipped: `low budget: ${remaining()}ms left` };
    } else {
      try {
        chunks = await backfillPendingChunks(
          Math.min(CHUNK_BACKFILL_TIME_BUDGET_MS, Math.max(remaining(), 0)),
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[Chunks] Backfill failed inside cron:", msg);
        chunks = { skipped: `error: ${msg}` };
      }
    }

    return NextResponse.json({ judgments, news, briefing, issueLines, chunks });
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
