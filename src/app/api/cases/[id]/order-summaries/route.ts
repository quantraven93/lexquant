import { createClient } from "@/lib/supabase/server";
import { summarizeOrder, isAIConfigured } from "@/lib/claude-ai";
import { extractPdfText } from "@/lib/pdf/extract";
import { NextResponse } from "next/server";

// Fetching + extracting + summarising several order PDFs is slow; match the
// other AI routes' ceiling so the lambda is not killed mid-batch.
export const maxDuration = 60;

type Order = {
  date?: string;
  orderType?: string;
  pdfUrl?: string;
  aiSummary?: string;
};

/**
 * Generate per-order AI summaries for a case's orders that have a fetchable
 * PDF (SC orders carry direct api.sci.gov.in URLs; HC order PDFs are
 * session-gated and have no pdfUrl, so they are skipped until a stored-PDF
 * pipeline exists). Summaries are cached on raw_data.orders[i].aiSummary so
 * each order is only summarised once.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!isAIConfigured()) {
    return NextResponse.json(
      { error: "AI summarisation not configured" },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: caseData, error } = await supabase
    .from("cases")
    .select("id, case_title, raw_data")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !caseData) {
    return NextResponse.json({ error: "Case not found" }, { status: 404 });
  }

  const rawData = (caseData.raw_data || {}) as Record<string, unknown>;
  const orders = (rawData.orders as Order[] | undefined) || [];

  const MAX_PER_RUN = 5;
  const TIME_BUDGET_MS = 50_000;
  const start = Date.now();
  let generated = 0;
  let attempted = 0;
  const errors: string[] = [];

  for (const o of orders) {
    if (generated >= MAX_PER_RUN) break;
    if (Date.now() - start > TIME_BUDGET_MS) break;
    if (!o.pdfUrl || o.aiSummary) continue;
    attempted++;
    try {
      const text = await extractPdfText(o.pdfUrl);
      if (text.length < 40) {
        errors.push(`${o.date}: no extractable text (scanned?)`);
        continue;
      }
      const summary = await summarizeOrder(text, caseData.case_title);
      if (summary) {
        o.aiSummary = summary;
        generated++;
      }
    } catch (e) {
      errors.push(`${o.date}: ${e instanceof Error ? e.message : "error"}`);
    }
  }

  if (generated > 0) {
    const { error: updErr } = await supabase
      .from("cases")
      .update({ raw_data: { ...rawData, orders } })
      .eq("id", id)
      .eq("user_id", user.id);
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }
  }

  const remaining = orders.filter((o) => o.pdfUrl && !o.aiSummary).length;
  return NextResponse.json({
    orders,
    generated,
    attempted,
    remaining,
    errors,
  });
}
