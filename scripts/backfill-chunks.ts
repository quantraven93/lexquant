/**
 * One-off backfill: chunk + embed every judgment where chunks_at IS NULL.
 *
 * Usage:
 *   pnpm tsx scripts/backfill-chunks.ts            # all pending
 *   pnpm tsx scripts/backfill-chunks.ts --limit=5  # cap for testing
 *   pnpm tsx scripts/backfill-chunks.ts --force    # re-embed everything
 *
 * Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, IK_API_KEY, VOYAGE_API_KEY.
 * Pull them from .env.local with `dotenv -e .env.local --` or export manually.
 */

import { createClient } from "@supabase/supabase-js";
import { embedJudgment } from "../src/lib/embed/store";

interface Args {
  limit?: number;
  force: boolean;
}

function parseArgs(): Args {
  const out: Args = { force: false };
  for (const arg of process.argv.slice(2)) {
    if (arg === "--force") out.force = true;
    else if (arg.startsWith("--limit=")) {
      const n = Number.parseInt(arg.slice("--limit=".length), 10);
      if (Number.isFinite(n) && n > 0) out.limit = n;
    }
  }
  return out;
}

async function main() {
  const args = parseArgs();

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required");
  }
  if (!process.env.IK_API_KEY) throw new Error("IK_API_KEY required");
  if (!process.env.VOYAGE_API_KEY) throw new Error("VOYAGE_API_KEY required");

  const supabase = createClient(url, key);

  let query = supabase
    .from("judgments")
    .select("ik_tid, title, chunks_at")
    .order("publish_date", { ascending: false });
  if (!args.force) query = query.is("chunks_at", null);
  if (args.limit) query = query.limit(args.limit);

  const { data, error } = await query;
  if (error) throw error;
  if (!data || !data.length) {
    console.log("[backfill] Nothing to do — no pending judgments.");
    return;
  }

  console.log(
    `[backfill] ${data.length} judgments to embed (force=${args.force})`,
  );

  let okCount = 0;
  let failCount = 0;
  let totalChunks = 0;
  let totalTokens = 0;

  for (const row of data) {
    const tid = row.ik_tid as number;
    const title = (row.title as string).slice(0, 70);
    process.stdout.write(`[backfill] tid=${tid}  "${title}"  ... `);
    try {
      const res = await embedJudgment(tid, { force: args.force });
      process.stdout.write(
        `${res.status}  chunks=${res.chunkCount}  tokens=${res.tokenCount}\n`,
      );
      okCount++;
      totalChunks += res.chunkCount;
      totalTokens += res.tokenCount;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stdout.write(`FAIL — ${msg}\n`);
      failCount++;
    }
  }

  console.log(
    `\n[backfill] Done. ok=${okCount} fail=${failCount} chunks=${totalChunks} tokens≈${totalTokens}`,
  );
}

main().catch((err) => {
  console.error("[backfill] Fatal:", err);
  process.exit(1);
});
