import { createClient } from "@/lib/supabase/server";
import { signOrderPdf } from "@/lib/storage/order-pdf";
import { NextResponse } from "next/server";

type Order = { pdfPath?: string };

/**
 * Serve a stored (HC) order PDF. The order's storage path is looked up by
 * index from the case's own raw_data (never trusted from the query string),
 * scoped to the signed-in owner, then redirected to a short-lived signed URL.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const n = Number(new URL(request.url).searchParams.get("n"));
  if (!Number.isInteger(n) || n < 0) {
    return NextResponse.json({ error: "Bad order index" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: caseData, error } = await supabase
    .from("cases")
    .select("raw_data")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !caseData) {
    return NextResponse.json({ error: "Case not found" }, { status: 404 });
  }

  const orders = ((caseData.raw_data as Record<string, unknown>)?.orders ||
    []) as Order[];
  const path = orders[n]?.pdfPath;
  // Defence in depth: the path must live under this case's folder.
  if (!path || !path.startsWith(`${id}/`)) {
    return NextResponse.json({ error: "No stored PDF" }, { status: 404 });
  }

  const signed = await signOrderPdf(path, 120);
  if (!signed) {
    return NextResponse.json({ error: "Could not sign URL" }, { status: 500 });
  }
  return NextResponse.redirect(signed);
}
