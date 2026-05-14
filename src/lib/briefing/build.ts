/**
 * Builds and persists daily briefings for every user with at least
 * one tracked case OR one watchlist item. Idempotent per user-date
 * (UNIQUE constraint on user_id + briefing_date).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { generateBriefing } from "./llm";
import { buildBriefingPrompt } from "./prompt";
import type { BriefingSignals } from "./types";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function todayIST(): string {
  // IST is UTC+5:30 — shift then slice YYYY-MM-DD
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

export interface PerUserResult {
  user_id: string;
  status: "generated" | "skipped" | "failed";
  signals?: BriefingSignals;
  reason?: string;
}

export interface IngestResult {
  totalUsers: number;
  generated: number;
  skipped: number;
  failed: number;
  perUser: PerUserResult[];
  duration_ms: number;
}

export async function generateMorningBriefings(): Promise<IngestResult> {
  const start = Date.now();
  const supabase = createAdminClient();
  const briefingDate = todayIST();
  const cutoffISO = new Date(Date.now() - ONE_DAY_MS).toISOString();

  console.log(`[Briefing] Run for ${briefingDate} starting`);

  // Fetch every user with any signal (tracked case OR watchlist item)
  const { data: profiles, error: pErr } = await supabase
    .from("profiles")
    .select("id");
  if (pErr) throw new Error(`profiles fetch: ${pErr.message}`);

  const perUser: PerUserResult[] = [];
  let generated = 0;
  let skipped = 0;
  let failed = 0;

  // Fresh-content snapshots (shared across all users)
  const [{ data: judgments }, { data: news }] = await Promise.all([
    supabase
      .from("judgments")
      .select("court_name, title, citation, publish_date")
      .gte("ingested_at", cutoffISO)
      .order("publish_date", { ascending: false, nullsFirst: false })
      .limit(20),
    supabase
      .from("news_items")
      .select("source_name, title, published_at")
      .gte("ingested_at", cutoffISO)
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(20),
  ]);

  for (const profile of profiles || []) {
    const uid = profile.id as string;
    try {
      const [{ data: cases }, { data: watchlist }, { data: existing }] =
        await Promise.all([
          supabase
            .from("cases")
            .select(
              "case_title, court_name, case_type, case_number, case_year, next_hearing_date, current_status",
            )
            .eq("user_id", uid)
            .eq("is_active", true),
          supabase
            .from("watchlist")
            .select("label, source_type, added_at")
            .eq("user_id", uid)
            .order("added_at", { ascending: false })
            .limit(15),
          supabase
            .from("daily_briefings")
            .select("id")
            .eq("user_id", uid)
            .eq("briefing_date", briefingDate)
            .maybeSingle(),
        ]);

      if (existing) {
        perUser.push({
          user_id: uid,
          status: "skipped",
          reason: "already-generated-today",
        });
        skipped++;
        continue;
      }

      const trackedCasesCount = cases?.length || 0;
      const watchlistCount = watchlist?.length || 0;
      if (trackedCasesCount === 0 && watchlistCount === 0) {
        perUser.push({
          user_id: uid,
          status: "skipped",
          reason: "no-signals",
        });
        skipped++;
        continue;
      }

      const upcomingHearings = (cases || []).filter((c) => {
        if (!c.next_hearing_date) return false;
        const d = new Date(c.next_hearing_date).getTime();
        const now = Date.now();
        return d >= now && d <= now + 7 * ONE_DAY_MS;
      }).length;

      const signals: BriefingSignals = {
        tracked_cases: trackedCasesCount,
        upcoming_hearings: upcomingHearings,
        fresh_judgments: judgments?.length || 0,
        fresh_news: news?.length || 0,
        watchlist_items: watchlistCount,
      };

      const prompt = buildBriefingPrompt({
        briefingDateIST: briefingDate,
        cases: cases || [],
        judgments: judgments || [],
        news: news || [],
        watchlist: watchlist || [],
      });

      const result = await generateBriefing(prompt);

      const { error: insErr } = await supabase.from("daily_briefings").insert({
        user_id: uid,
        briefing_date: briefingDate,
        body: result.body,
        provider: result.provider,
        model: result.model,
        input_signals: signals,
        prompt_chars: result.prompt_chars,
        output_chars: result.output_chars,
        duration_ms: result.duration_ms,
      });
      if (insErr) throw new Error(`db insert: ${insErr.message}`);

      perUser.push({ user_id: uid, status: "generated", signals });
      generated++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[Briefing] User ${uid} failed:`, msg);
      perUser.push({ user_id: uid, status: "failed", reason: msg });
      failed++;
    }
  }

  const duration_ms = Date.now() - start;
  console.log(
    `[Briefing] Done in ${duration_ms}ms: ${generated} generated, ${skipped} skipped, ${failed} failed`,
  );

  return {
    totalUsers: profiles?.length || 0,
    generated,
    skipped,
    failed,
    perUser,
    duration_ms,
  };
}
