import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") || "20", 10),
    100,
  );
  const court = url.searchParams.get("court");

  const supabase = createAdminClient();
  let query = supabase
    .from("us_opinions")
    .select(
      "id, cl_id, cluster_id, court_id, court_name, case_name, citations, date_filed, judge, snippet, status, source_url, ingested_at",
    )
    .order("date_filed", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (court) query = query.eq("court_id", court);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ opinions: data || [] });
}
