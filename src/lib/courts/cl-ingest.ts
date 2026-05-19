/**
 * US opinions ingest — shared core for both the standalone CL cron
 * route (manual triggers) and the bundled call inside the
 * aggregate-judgments cron (current daily run).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import {
  CL_COURTS,
  fetchOpinionsForAllCourts,
  type USOpinionRecord,
} from "./courtlistener";

export interface USIngestResult {
  fetched: number;
  upserted: number;
  errors: number;
  breakdown: Record<string, number>;
  duration: number;
  range: { filed_after: string };
}

const DEFAULT_COURTS = Object.keys(CL_COURTS);

export async function ingestUSOpinions(): Promise<USIngestResult> {
  const startTime = Date.now();
  const supabase = createAdminClient();

  if (!process.env.COURTLISTENER_API_KEY) {
    console.warn(
      "[US] Skipping ingest — COURTLISTENER_API_KEY not set (sign up at https://www.courtlistener.com/sign-in/)",
    );
    return {
      fetched: 0,
      upserted: 0,
      errors: 0,
      breakdown: {},
      duration: 0,
      range: { filed_after: "" },
    };
  }

  // Look back 3 days — CL indexing has up to 48h lag for some courts
  const filedAfter = new Date();
  filedAfter.setDate(filedAfter.getDate() - 3);
  const filedAfterStr = filedAfter.toISOString().slice(0, 10);

  console.log(
    `[US] Ingesting ${DEFAULT_COURTS.length} courts since ${filedAfterStr}`,
  );

  const byCourt = await fetchOpinionsForAllCourts({
    courts: DEFAULT_COURTS,
    filedAfter,
    pagesPerCourt: 1,
  });

  let fetched = 0;
  let upserted = 0;
  let errors = 0;
  const breakdown: Record<string, number> = {};

  for (const [court, ops] of byCourt.entries()) {
    breakdown[court] = ops.length;
    fetched += ops.length;
    if (!ops.length) continue;

    // Deduplicate by cl_id within this run (CL search can echo the
    // same opinion across pages on some queries)
    const byClId = new Map<number, USOpinionRecord>();
    for (const op of ops) byClId.set(op.cl_id, op);
    const deduped = Array.from(byClId.values());

    const { data, error } = await supabase
      .from("us_opinions")
      .upsert(deduped, { onConflict: "cl_id", ignoreDuplicates: false })
      .select("id");

    if (error) {
      errors++;
      console.error(`[US] Upsert failed for ${court}:`, error.message);
      continue;
    }
    upserted += data?.length || 0;
    console.log(
      `[US] ${court}: ${ops.length} fetched, ${data?.length || 0} upserted`,
    );
  }

  const duration = Date.now() - startTime;
  console.log(
    `[US] Done in ${duration}ms: ${fetched} fetched, ${upserted} upserted, ${errors} errors`,
  );

  return {
    fetched,
    upserted,
    errors,
    breakdown,
    duration,
    range: { filed_after: filedAfterStr },
  };
}
