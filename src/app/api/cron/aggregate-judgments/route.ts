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

export const maxDuration = 60;

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
    return NextResponse.json({ judgments, news });
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
