/**
 * Standalone morning-briefing cron endpoint.
 *
 * Generates a per-user AI briefing combining tracked cases, fresh
 * judgments, news, and watchlist items, then writes one row per
 * user to `daily_briefings` (unique on user_id + briefing_date).
 *
 * Auth: requires CRON_SECRET in Authorization header. Idle when
 * LLM provider creds (GEMINI_API_KEY by default) are missing —
 * the call to generateBriefing() will throw and that user fails;
 * other users continue.
 */

import { NextResponse } from "next/server";
import { generateMorningBriefings } from "@/lib/briefing/build";

export const maxDuration = 60;

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await generateMorningBriefings();
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("[Briefing] Fatal:", err);
    return NextResponse.json(
      { error: "Internal error", details: String(err) },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}
