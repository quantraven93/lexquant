import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingColumnError } from "@/lib/courts/case-refresh";
import { freshWithinWorkingDays } from "@/lib/health/court-calendar";

/**
 * Source-health endpoint backing the menubar live dots and the ticker's
 * "new today" counts. Status is DERIVED from ingest/refresh timestamps in
 * the DB — a dot is live only if its pipeline actually ran recently:
 *
 *   ik      — judgments ingest (daily cron): must have produced something
 *             within one court-working day
 *   sci     — Supreme Court judgments specifically: within two, since the
 *             SC's daily volume is small enough that one quiet day is not
 *             evidence of a fault
 *   ecourts — tracked-case refresh (daily Vercel cron, 03:00 UTC):
 *             fresh within 36h. The 30-min GitHub Action the old 3h window
 *             assumed has never had an ANTHROPIC_API_KEY and produces
 *             nothing. This one is wall-clock because a court refresh is
 *             OUR job to run every day, not the courts' job to feed.
 *
 * The judgment sources are measured in COURT-WORKING DAYS, not hours,
 * because the corpus has a weekend hole in it. See
 * `@/lib/health/court-calendar` for why, and for what that does not model.
 *
 * The ecourts dot reads `last_fetch_ok` — set only when a court fetch
 * actually parsed — not `last_checked_at`, which the cron writes even when
 * the fetch failed. Before migration 012 is applied the column does not
 * exist, so the query falls back to `last_checked_at` and says so in
 * `sources.ecourts.signal`.
 *
 * "Today" is the IST calendar day, since the whole board is IST.
 */

export const dynamic = "force-dynamic";

const HOUR_MS = 3_600_000;
const IST_OFFSET_MS = 5.5 * HOUR_MS;

/** Court-working days a judgment source may go quiet before its dot reds. */
const IK_MAX_QUIET_WORKING_DAYS = 1;
const SCI_MAX_QUIET_WORKING_DAYS = 2;

function freshWithin(ts: string | null, hours: number): boolean {
  if (!ts) return false;
  return Date.now() - new Date(ts).getTime() <= hours * HOUR_MS;
}

function istDayStartIso(): string {
  const istNow = Date.now() + IST_OFFSET_MS;
  const istMidnightUtcMs = istNow - (istNow % 86_400_000) - IST_OFFSET_MS;
  return new Date(istMidnightUtcMs).toISOString();
}

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

/**
 * Most recent genuinely-successful case fetch. Falls back to the weaker
 * `last_checked_at` while migration 012 is unapplied, since that query
 * errors on the missing column rather than returning null.
 */
async function latestCaseFetch(supabase: SupabaseAdmin): Promise<{
  last: string | null;
  signal: "last_fetch_ok" | "last_checked_at";
}> {
  try {
    const okQuery = await supabase
      .from("cases")
      .select("last_fetch_ok")
      .order("last_fetch_ok", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (!okQuery.error) {
      return {
        last: okQuery.data?.last_fetch_ok ?? null,
        signal: "last_fetch_ok",
      };
    }
    // Only a genuinely absent column falls back. Any other error must not
    // masquerade as "migration 012 pending" — that is the same dishonest
    // signal this endpoint is being fixed to stop emitting.
    if (!isMissingColumnError(okQuery.error, "last_fetch_ok")) {
      console.error("[Health] last_fetch_ok lookup failed:", okQuery.error);
      return { last: null, signal: "last_fetch_ok" };
    }
  } catch (err) {
    console.error("[Health] last_fetch_ok lookup threw:", err);
  }

  const fallback = await supabase
    .from("cases")
    .select("last_checked_at")
    .order("last_checked_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  return {
    last: fallback.data?.last_checked_at ?? null,
    signal: "last_checked_at",
  };
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
      latestCaseFetch(supabase),
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
  const ecourtsLast = latestCaseCheck.last;

  return NextResponse.json({
    sources: {
      ik: {
        ok: freshWithinWorkingDays(ikLast, IK_MAX_QUIET_WORKING_DAYS),
        last: ikLast,
      },
      sci: {
        ok: freshWithinWorkingDays(sciLast, SCI_MAX_QUIET_WORKING_DAYS),
        last: sciLast,
      },
      ecourts: {
        ok: freshWithin(ecourtsLast, 36),
        last: ecourtsLast,
        signal: latestCaseCheck.signal,
      },
    },
    today: {
      judgments: judgmentsToday.count ?? 0,
      news: newsToday.count ?? 0,
    },
  });
}
