import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchJudgeDossier } from "@/lib/ik/judge";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const name = decodeURIComponent(slug).trim();
  if (!name) {
    return NextResponse.json({ error: "Missing judge name" }, { status: 400 });
  }

  // Same gating as /api/research — IK searches are billed.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const dossier = await fetchJudgeDossier(name);
    return NextResponse.json(
      { dossier },
      {
        headers: { "Cache-Control": "private, max-age=3600" },
      },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Judge] name=${name} failed:`, msg);
    return NextResponse.json(
      { error: "Failed to fetch judge dossier", details: msg },
      { status: 502 },
    );
  }
}
