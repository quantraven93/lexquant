import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface PinnedMatter {
  id: string;
  case_title: string;
  case_number: string;
  case_year: string | null;
  case_type: string | null;
  court_type: string;
  next_hearing_date: string | null;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const todayIso = new Date().toISOString().slice(0, 10);

  // Run all aggregates in parallel.
  const [casesR, hearingsR, watchR, judgmentsR, pinnedR] = await Promise.all([
    supabase
      .from("cases")
      .select("court_type", { count: "exact" })
      .eq("user_id", user.id),
    supabase
      .from("cases")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("next_hearing_date", todayIso),
    supabase
      .from("watchlist")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
    admin.from("judgments").select("id", { count: "exact", head: true }),
    supabase
      .from("cases")
      .select(
        "id, case_title, case_number, case_year, case_type, court_type, next_hearing_date",
      )
      .eq("user_id", user.id)
      .eq("is_active", true)
      .gte("next_hearing_date", todayIso)
      .order("next_hearing_date", { ascending: true, nullsFirst: false })
      .limit(3),
  ]);

  // Court breakdown.
  const courts: Record<string, number> = {};
  if (casesR.data) {
    for (const row of casesR.data) {
      const t = (row.court_type || "OTHER").toUpperCase();
      courts[t] = (courts[t] || 0) + 1;
    }
  }

  const pinned: PinnedMatter[] = (pinnedR.data || []).map((c) => ({
    id: c.id,
    case_title: c.case_title || "",
    case_number: c.case_number,
    case_year: c.case_year,
    case_type: c.case_type,
    court_type: c.court_type,
    next_hearing_date: c.next_hearing_date,
  }));

  return NextResponse.json({
    workspace: {
      matters: casesR.count ?? casesR.data?.length ?? 0,
      hearingsToday: hearingsR.count ?? 0,
      saved: watchR.count ?? 0,
      judgments: judgmentsR.count ?? 0,
    },
    courts,
    pinned,
  });
}
