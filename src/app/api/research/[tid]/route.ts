import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getResearchView } from "@/lib/ik/doc";

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
