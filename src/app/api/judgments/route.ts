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
    .from("judgments")
    .select(
      "id, ik_tid, court_code, court_name, title, citation, publish_date, author, headline, source_url, ingested_at",
    )
    .order("publish_date", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (court) query = query.eq("court_code", court);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ judgments: data || [] });
}
