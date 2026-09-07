/**
 * Repair the rows that the invalid `doctypes:bangalore` doctype poisoned.
 *
 * An unrecognised IK doctype is not an error to the IK API: it drops the
 * filter and returns an unfiltered result set. The ingest then stamped every
 * one of those documents `court_code: "bangalore"` / "Karnataka High Court".
 * None of them are Karnataka judgments. Each row's true origin survives in
 * `raw_data.docsource`, so the damage is auditable row by row.
 *
 * Usage:
 *   pnpm tsx scripts/repair-mislabelled-judgments.ts              # dry run
 *   pnpm tsx scripts/repair-mislabelled-judgments.ts --delete     # remove them
 *   pnpm tsx scripts/repair-mislabelled-judgments.ts --relabel    # retag from docsource
 *
 * --relabel only rewrites rows whose docsource maps to a court this app
 * actually ingests; anything else (district courts, tribunals, consumer
 * commissions) has no valid court_code and is reported as unmappable.
 *
 * Required env: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY.
 * Pull them from .env.local with `dotenv -e .env.local --` or export manually.
 */

import { createClient } from "@supabase/supabase-js";
import { IK_DOCSOURCE, IK_COURTS, type IKCourtCode } from "../src/lib/courts/ik-judgments";

const BAD_COURT_CODE = "bangalore";

type Mode = "dry-run" | "delete" | "relabel";

function parseMode(): Mode {
  const argv = process.argv.slice(2);
  if (argv.includes("--delete") && argv.includes("--relabel")) {
    throw new Error("--delete and --relabel are mutually exclusive");
  }
  if (argv.includes("--delete")) return "delete";
  if (argv.includes("--relabel")) return "relabel";
  return "dry-run";
}

/** docsource -> the court code this app would ingest it under, if any. */
const CODE_BY_DOCSOURCE = new Map<string, IKCourtCode>(
  (Object.keys(IK_DOCSOURCE) as IKCourtCode[]).map((code) => [
    IK_DOCSOURCE[code],
    code,
  ]),
);

interface Row {
  id: string;
  ik_tid: number;
  raw_data: { docsource?: string } | null;
}

async function main() {
  const mode = parseMode();
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required");
  }
  const supabase = createClient(url, key);

  const { data, error } = await supabase
    .from("judgments")
    .select("id, ik_tid, raw_data")
    .eq("court_code", BAD_COURT_CODE);
  if (error) throw error;

  const rows = (data ?? []) as Row[];
  if (!rows.length) {
    console.log(`No rows with court_code='${BAD_COURT_CODE}'. Nothing to do.`);
    return;
  }

  const byDocsource = new Map<string, Row[]>();
  for (const row of rows) {
    const src = row.raw_data?.docsource ?? "(no docsource)";
    const bucket = byDocsource.get(src) ?? [];
    bucket.push(row);
    byDocsource.set(src, bucket);
  }

  const mappable: Array<{ row: Row; code: IKCourtCode }> = [];
  const unmappable: Row[] = [];
  for (const [src, bucket] of byDocsource) {
    const code = CODE_BY_DOCSOURCE.get(src);
    if (code) bucket.forEach((row) => mappable.push({ row, code }));
    else unmappable.push(...bucket);
  }

  console.log(`\nRows mislabelled '${BAD_COURT_CODE}': ${rows.length}\n`);
  console.log("  by true docsource:");
  for (const [src, bucket] of [...byDocsource].sort(
    (a, b) => b[1].length - a[1].length,
  )) {
    const code = CODE_BY_DOCSOURCE.get(src);
    const tag = code ? `-> ${code}` : "-> UNMAPPABLE (not a court this app ingests)";
    console.log(`    ${String(bucket.length).padStart(5)}  ${src.padEnd(52)} ${tag}`);
  }
  console.log(
    `\n  relabellable: ${mappable.length}   unmappable: ${unmappable.length}`,
  );

  if (mode === "dry-run") {
    console.log(
      "\nDry run — nothing written. Re-run with --delete or --relabel.\n",
    );
    return;
  }

  if (mode === "delete") {
    const { error: delErr, count } = await supabase
      .from("judgments")
      .delete({ count: "exact" })
      .eq("court_code", BAD_COURT_CODE);
    if (delErr) throw delErr;
    console.log(`\nDeleted ${count ?? 0} rows.\n`);
    return;
  }

  let relabelled = 0;
  for (const { row, code } of mappable) {
    const { error: upErr } = await supabase
      .from("judgments")
      .update({ court_code: code, court_name: IK_COURTS[code] })
      .eq("id", row.id);
    if (upErr) {
      console.error(`  tid ${row.ik_tid}: ${upErr.message}`);
      continue;
    }
    relabelled++;
  }
  console.log(
    `\nRelabelled ${relabelled}. Left ${unmappable.length} unmappable rows ` +
      `still tagged '${BAD_COURT_CODE}' — delete them separately if unwanted.\n`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
