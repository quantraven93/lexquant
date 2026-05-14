/**
 * News ingest — shared core for both the standalone news cron route
 * (manual triggers / future split) and the bundled call inside the
 * aggregate-judgments cron (current daily run).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllFeeds } from "./rss-aggregator";

export interface NewsIngestResult {
  fetched: number;
  upserted: number;
  breakdown: Record<string, number>;
  errors: Array<{ source: string; error: string }>;
  duration: number;
}

export async function ingestNews(): Promise<NewsIngestResult> {
  const startTime = Date.now();
  const supabase = createAdminClient();

  console.log("[News] Starting RSS aggregation across all sources");

  const { records, breakdown, errors } = await fetchAllFeeds();

  let upserted = 0;
  if (records.length > 0) {
    const { data, error } = await supabase
      .from("news_items")
      .upsert(records, { onConflict: "guid", ignoreDuplicates: false })
      .select("id");

    if (error) {
      console.error("[News] Upsert failed:", error.message);
      throw new Error(`Supabase upsert failed: ${error.message}`);
    }
    upserted = data?.length || 0;
  }

  const duration = Date.now() - startTime;
  console.log(
    `[News] Done in ${duration}ms: ${records.length} fetched, ${upserted} upserted, ${errors.length} feed errors`,
  );
  for (const e of errors) console.warn(`[News] ${e.source} failed: ${e.error}`);

  return {
    fetched: records.length,
    upserted,
    breakdown,
    errors,
    duration,
  };
}
