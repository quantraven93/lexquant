import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Source-health endpoint backing the menubar live dots and the ticker's
 * "new today" counts. Status is DERIVED from ingest/refresh timestamps in
 * the DB — a dot is live only if its pipeline actually ran recently:
 *
 *   ik      — judgments ingest (daily cron): fresh within 36h
 *   sci     — Supreme Court judgments specifically: fresh within 96h
 *             (SC publishes on working days; 96h spans a weekend)
 *   ecourts — tracked-case refresh (30-min GitHub Action): fresh within 3h
 *
 * "Today" is the IST calendar day, since the whole board is IST.
 */

export const dynamic = "force-dynamic";

const HOUR_MS = 3_600_000;
const IST_OFFSET_MS = 5.5 * HOUR_MS;

function freshWithin(ts: string | null, hours: number): boolean {
  if (!ts) return false;
  return Date.now() - new Date(ts).getTime() <= hours * HOUR_MS;
}

function istDayStartIso(): string {
  const istNow = Date.now() + IST_OFFSET_MS;
  const istMidnightUtcMs = istNow - (istNow % 86_400_000) - IST_OFFSET_MS;
  return new Date(istMidnightUtcMs).toISOString();
}

export async function GET() {
  const supabase = createAdminClient();
  const todayStart = istDayStartIso();

  const [latestJudgment, latestSc, latestCaseCheck, judgmentsToday, newsToday] =
    await Promise.all([
      supabase
        .from("judgments")
        .select("ingested_at")
        .order("ingested_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("judgments")
        .select("ingested_at")
        .in("court_code", ["supremecourt", "scorders"])
        .order("ingested_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("cases")
        .select("last_checked_at")
        .order("last_checked_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("judgments")
        .select("*", { count: "exact", head: true })
        .gte("ingested_at", todayStart),
      supabase
        .from("news_items")
        .select("*", { count: "exact", head: true })
        .gte("created_at", todayStart),
    ]);

  const ikLast = latestJudgment.data?.ingested_at ?? null;
  const sciLast = latestSc.data?.ingested_at ?? null;
  const ecourtsLast = latestCaseCheck.data?.last_checked_at ?? null;

  return NextResponse.json({
    sources: {
      ik: { ok: freshWithin(ikLast, 36), last: ikLast },
      sci: { ok: freshWithin(sciLast, 96), last: sciLast },
      ecourts: { ok: freshWithin(ecourtsLast, 3), last: ecourtsLast },
    },
    today: {
      judgments: judgmentsToday.count ?? 0,
      news: newsToday.count ?? 0,
    },
  });
}
