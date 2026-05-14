/**
 * Standalone US opinions cron endpoint — manual trigger for the
 * CourtListener ingest.
 *
 * Note: the daily Vercel schedule does NOT call this route directly.
 * US ingest runs inside `aggregate-judgments` to stay within Hobby
 * tier's 2-cron cap. This route exists for manual `curl` invocations
 * (with CRON_SECRET) when debugging the US pipeline in isolation.
 */

import { NextResponse } from "next/server";
import { ingestUSOpinions } from "@/lib/courts/cl-ingest";

export const maxDuration = 60;

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await ingestUSOpinions();
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("[US] Fatal:", err);
    return NextResponse.json(
      { error: "Internal error", details: String(err) },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}
