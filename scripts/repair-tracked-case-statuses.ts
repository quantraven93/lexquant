/**
 * One-off: correct the four tracked `cases` rows the old scraper fabricated.
 *
 * PR #51 stopped the refresh writing a literal "Pending" over real statuses,
 * but deliberately did not touch the rows already poisoned — that needed a
 * re-verified read from the court registry, not a code change. This is that
 * read, applied.
 *
 * Every value below was verified against eCourts on 2026-09-07, by CNR:
 *
 *   CRLP  1932/2026  APHC010124792026  DISPOSED 2026-04-09, INFRUCTUOUS,
 *                                      CONTESTED, Y. LAKSHMANA RAO
 *   CRLRC  174/2026  APHC010081612026  DISPOSED 2026-02-17,
 *                                      VENKATA JYOTHIRMAI PRATAPA
 *   Crl.A 1536/2026  SCIN010053452026  ADMITTED — leave granted 2026-03-20,
 *                                      appeal is LIVE. No decision date
 *                                      exists; the stored 2026-03-24 was
 *                                      fabricated. Re-scraped from the court
 *                                      server 2026-09-07: no future date
 *                                      published yet.
 *   OS    1806/2025  APKR060035512025  PENDING (correct), next hearing
 *                                      2026-09-25. Kallam Bhaskara Reddy v.
 *                                      Saginala Joseph & 19 ors, Junior Civil
 *                                      Court, Vijayawada, Krishna.
 *
 * The CNRs on the SC and district rows are the durable half of this fix:
 * without one, the refresh cannot identify those matters at all and they
 * would drift again even with #51 deployed.
 *
 * Usage:
 *   pnpm tsx scripts/repair-tracked-case-statuses.ts            # dry run
 *   pnpm tsx scripts/repair-tracked-case-statuses.ts --apply
 */

import { createClient } from "@supabase/supabase-js";

type Fields = Record<string, string | null>;

/** Keyed by case_number, which is unique across the four tracked rows. */
const CORRECTIONS: Record<string, { note: string; set: Fields }> = {
  "1932": {
    note: "CRLP 1932/2026 — disposed as infructuous, 09-04-2026",
    set: { current_status: "DISPOSED" },
  },
  "174": {
    note: "CRLRC 174/2026 — disposed 17-02-2026; judge field held a table label",
    set: {
      current_status: "DISPOSED",
      decision_date: "2026-02-17",
      last_order_date: "2026-02-17",
      judges: "VENKATA JYOTHIRMAI PRATAPA",
      next_hearing_date: null,
    },
  },
  "001536": {
    note: "Crl.A. 1536/2026 — ADMITTED, live; fabricated decision_date cleared",
    set: {
      cnr_number: "SCIN010053452026",
      current_status: "ADMITTED",
      decision_date: null,
      judges: "PANKAJ MITHAL, S.V.N. BHATTI",
      next_hearing_date: null,
    },
  },
  "1806": {
    note: "OS 1806/2025 — status was right; identity and the 25-09 date were missing",
    set: {
      cnr_number: "APKR060035512025",
      case_title: "Kallam Bhaskara Reddy vs Saginala Joseph & Ors",
      court_name: "Junior Civil Court, Vijayawada, Krishna, Andhra Pradesh",
      current_status: "PENDING",
      next_hearing_date: "2026-09-25",
      filing_date: "2025-11-11",
    },
  },
};

async function main() {
  const apply = process.argv.slice(2).includes("--apply");
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required");
  }
  const supabase = createClient(url, key);

  const { data, error } = await supabase.from("cases").select("*");
  if (error) throw error;

  let changed = 0;
  for (const row of data ?? []) {
    const correction = CORRECTIONS[row.case_number as string];
    if (!correction) {
      console.log(`\n?  case_number=${row.case_number} — no correction mapped`);
      continue;
    }

    const diff = Object.entries(correction.set).filter(
      ([field, next]) => (row[field] ?? null) !== next,
    );

    console.log(`\n${correction.note}`);
    if (!diff.length) {
      console.log("   already correct");
      continue;
    }
    for (const [field, next] of diff) {
      console.log(
        `   ${field}: ${JSON.stringify(row[field] ?? null)} -> ${JSON.stringify(next)}`,
      );
    }
    changed++;

    if (!apply) continue;

    const { error: upErr } = await supabase
      .from("cases")
      .update(Object.fromEntries(diff))
      .eq("id", row.id);
    if (upErr) {
      console.error(`   FAILED: ${upErr.message}`);
      continue;
    }
    console.log("   applied");
  }

  console.log(
    apply
      ? `\nApplied changes to ${changed} row(s).\n`
      : `\nDry run — ${changed} row(s) would change. Re-run with --apply.\n`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
