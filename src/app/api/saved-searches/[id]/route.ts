/**
 * Saved Searches — per-id DELETE (remove).
 *
 * The run endpoint is intentionally a sibling (./run) so that DELETE on
 * this collection-of-one URL stays unambiguous in routing.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // RLS ensures we can only delete our own rows; the eq is belt-and-braces.
  const { error } = await supabase
    .from("saved_searches")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json(
      { error: "Delete failed", details: error.message },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
