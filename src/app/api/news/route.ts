import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") || "20", 10),
    100,
  );
  const source = url.searchParams.get("source");

  const supabase = createAdminClient();
  let query = supabase
    .from("news_items")
    .select(
      "id, guid, source, source_name, title, link, summary, author, categories, published_at, ingested_at",
    )
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (source) query = query.eq("source", source);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ news: data || [] });
}
