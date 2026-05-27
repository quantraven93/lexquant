import { NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchIKDoc, parseIKDoc } from "@/lib/ik/doc";
import type { IKDocResponse, ParsedResearchView } from "@/lib/ik/types";
import { embedJudgment } from "@/lib/embed/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ResolvedView {
  view: ParsedResearchView;
  source: "cache" | "ik";
  cachedAt: string | null;
}

async function resolveView(
  tid: number,
  refresh: boolean,
): Promise<ResolvedView> {
  const admin = createAdminClient();

  if (!refresh) {
    const { data, error } = await admin
      .from("judgments")
      .select("raw_doc, doc_cached_at")
      .eq("ik_tid", tid)
      .maybeSingle();
    if (error) {
      console.warn(
        `[Research] tid=${tid} cache lookup failed (falling back to IK):`,
        error.message,
      );
    } else if (data?.raw_doc && data.doc_cached_at) {
      return {
        view: parseIKDoc(data.raw_doc as IKDocResponse),
        source: "cache",
        cachedAt: data.doc_cached_at as string,
      };
    }
  }

  const raw = await fetchIKDoc(tid);
  const view = parseIKDoc(raw);

  // Persist the full IK payload + a cached_at marker so the next caller
  // can skip IK entirely. Uses after() so the response isn't gated on
  // the write; safe even when the judgments row hasn't been ingested yet
  // (.update() on a missing row is a no-op).
  after(async () => {
    const writer = createAdminClient();
    const { error } = await writer
      .from("judgments")
      .update({
        raw_doc: raw,
        doc_cached_at: new Date().toISOString(),
      })
      .eq("ik_tid", tid);
    if (error) {
      console.warn(
        `[Research] tid=${tid} doc cache write failed:`,
        error.message,
      );
    }
  });

  return { view, source: "ik", cachedAt: null };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ tid: string }> },
) {
  const { tid: tidParam } = await context.params;
  const tid = Number.parseInt(tidParam, 10);
  if (!Number.isFinite(tid) || tid <= 0) {
    return NextResponse.json({ error: "Invalid tid" }, { status: 400 });
  }

  const url = new URL(request.url);
  // `?refresh=1` skips the DB cache and re-pulls from IK (still warms
  // the cache for next time). Useful when IK has corrected a judgment
  // or the cached parse missed a structure tag we now want.
  const refresh = ["1", "true", "yes"].includes(
    (url.searchParams.get("refresh") || "").toLowerCase(),
  );

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
    const { view, source, cachedAt } = await resolveView(tid, refresh);

    // Background work — runs after the response is sent but stays tracked
    // by the runtime so Vercel won't cancel mid-flight. `after()` is the
    // Next 16+ replacement for bare fire-and-forget on serverless.

    // Cache the citation arrays onto the judgments row so future renders
    // can light the graph without a fresh IK fetch. Skip when serving
    // from cache — cites/citedBy were already serialized in raw_doc.
    if (source === "ik" && (view.cites.length || view.citedBy.length)) {
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
    // view so no second IK doc call is made. We run this regardless of
    // source so a cached doc with no chunks yet (e.g. backfill hadn't
    // run when the doc was first cached) still gets embedded.
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
      { view, source, cachedAt },
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
