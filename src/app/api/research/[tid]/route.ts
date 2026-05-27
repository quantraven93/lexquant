import { NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResearchView } from "@/lib/ik/doc";
import { embedJudgment } from "@/lib/embed/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  _request: Request,
  context: { params: Promise<{ tid: string }> },
) {
  const { tid: tidParam } = await context.params;
  const tid = Number.parseInt(tidParam, 10);
  if (!Number.isFinite(tid) || tid <= 0) {
    return NextResponse.json({ error: "Invalid tid" }, { status: 400 });
  }

  // Require an authenticated session — research view is a paid IK call
  // and we don't want it exposed to anonymous traffic.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const view = await getResearchView(tid);

    // Background work — runs after the response is sent but stays tracked
    // by the runtime so Vercel won't cancel mid-flight. `after()` is the
    // Next 16+ replacement for bare fire-and-forget on serverless.

    // Cache the citation arrays onto the judgments row so future renders
    // can light the graph without a fresh IK fetch.
    if (view.cites.length || view.citedBy.length) {
      after(async () => {
        const admin = createAdminClient();
        const { error } = await admin
          .from("judgments")
          .update({
            cites_tids: view.cites.map((c) => c.tid),
            cited_by_tids: view.citedBy.map((c) => c.tid),
            citations_fetched_at: new Date().toISOString(),
          })
          .eq("ik_tid", tid);
        if (error) {
          console.warn(
            `[Research] tid=${tid} citation cache failed:`,
            error.message,
          );
        }
      });
    }

    // Chunk + embed for semantic search. Idempotent — skips when
    // judgments.chunks_at is already set. Reuses the already-fetched
    // view so no second IK doc call is made.
    if (process.env.VOYAGE_API_KEY) {
      after(async () => {
        try {
          await embedJudgment(tid, { view });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`[Research] tid=${tid} embed failed:`, msg);
        }
      });
    }

    return NextResponse.json(
      { view },
      {
        // 1-hour cache hint — judgments are immutable, so anything is safe
        headers: { "Cache-Control": "private, max-age=3600" },
      },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Research] tid=${tid} failed:`, msg);
    return NextResponse.json(
      { error: "Failed to fetch judgment", details: msg },
      { status: 502 },
    );
  }
}
