import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { detectSourceType } from "@/lib/watchlist/detect";
import type {
  WatchlistAddInput,
  WatchlistSourceType,
} from "@/lib/watchlist/types";

export const dynamic = "force-dynamic";

const ALLOWED_TYPES: WatchlistSourceType[] = [
  "judgment",
  "news",
  "case",
  "url",
];

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("watchlist")
    .select("id, user_id, label, url, note, source_type, source_ref, added_at")
    .eq("user_id", user.id)
    .order("added_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data || [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: WatchlistAddInput;
  try {
    body = (await request.json()) as WatchlistAddInput;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const label = body.label?.trim();
  const url = body.url?.trim();
  if (!label || !url) {
    return NextResponse.json(
      { error: "label and url are required" },
      { status: 400 },
    );
  }

  try {
    new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  // Caller may pass explicit source_type; otherwise auto-detect
  const detected = detectSourceType(url);
  const source_type: WatchlistSourceType =
    body.source_type && ALLOWED_TYPES.includes(body.source_type)
      ? body.source_type
      : detected.source_type;
  const source_ref = body.source_ref ?? detected.source_ref;

  const { data, error } = await supabase
    .from("watchlist")
    .insert({
      user_id: user.id,
      label,
      url,
      note: body.note?.trim() || "",
      source_type,
      source_ref,
    })
    .select("id, user_id, label, url, note, source_type, source_ref, added_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Already in watchlist" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ item: data }, { status: 201 });
}
