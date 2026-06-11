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
  const baseColumns =
    "id, ik_tid, court_code, court_name, title, citation, publish_date, author, headline, source_url, ingested_at, cited_by_tids";

  // issue_line arrives with migration 011 — fall back to the base column
  // set until it is applied so the digest keeps working either way.
  for (const columns of [`${baseColumns}, issue_line`, baseColumns]) {
    let query = supabase
      .from("judgments")
      .select(columns)
      .order("publish_date", { ascending: false, nullsFirst: false })
      .limit(limit);
    if (court) query = query.eq("court_code", court);

    const { data, error } = await query;
    if (!error) {
      return NextResponse.json({ judgments: data || [] });
    }
    if (!/issue_line/i.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }
  return NextResponse.json({ judgments: [] });
}
