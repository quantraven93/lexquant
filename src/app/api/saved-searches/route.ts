/**
 * Saved Searches — list (GET) + create (POST).
 *
 * GET returns the caller's own saved searches, ordered by last_run_at
 * desc nulls last so newly-created (never-run) ones surface first.
 * POST creates a new saved search owned by the caller.
 *
 * Per-row reads/writes guarded by RLS on saved_searches (migration 010)
 * so we use the user-scoped client, not the admin client.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface CreateBody {
  name?: unknown;
  query?: unknown;
  structureFilter?: unknown;
  courtFilter?: unknown;
}

function asStringArray(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const out = v.filter((x) => typeof x === "string" && x.trim()).map(String);
  return out.length ? out : null;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("saved_searches")
    .select(
      "id, name, query, structure_filter, court_filter, created_at, last_run_at, last_top_distance, last_top_ik_tid, new_matches_since_run",
    )
    .eq("user_id", user.id)
    .order("last_run_at", { ascending: false, nullsFirst: true })
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "Failed to load saved searches", details: error.message },
      { status: 502 },
    );
  }

  return NextResponse.json(
    { searches: data || [] },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!name || name.length > 120) {
    return NextResponse.json(
      { error: "Name required (1-120 chars)" },
      { status: 400 },
    );
  }
  if (query.length < 3 || query.length > 800) {
    return NextResponse.json(
      { error: "Query must be 3-800 characters" },
      { status: 400 },
    );
  }

  const row = {
    user_id: user.id,
    name,
    query,
    structure_filter: asStringArray(body.structureFilter),
    court_filter: asStringArray(body.courtFilter),
  };

  const { data, error } = await supabase
    .from("saved_searches")
    .insert(row)
    .select(
      "id, name, query, structure_filter, court_filter, created_at, last_run_at, last_top_distance, last_top_ik_tid, new_matches_since_run",
    )
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Failed to create saved search", details: error.message },
      { status: 502 },
    );
  }

  return NextResponse.json({ search: data }, { status: 201 });
}
