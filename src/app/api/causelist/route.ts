import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  searchCauselist,
  isCauselistConfigured,
  type CauselistEntry,
} from "@/lib/causelist/ecourtsindia";

/**
 * The terminal's cause-list tape: which of the user's tracked matters are
 * listed in court over the coming days, with serial number, bench and judge.
 *
 * Matching per tracked case, cheapest-first:
 *   1. free-text `q` on "CASETYPE/NUMBER/YEAR" (cause lists store case
 *      numbers in that shape), then
 *   2. `litigant` on the lead petitioner's first two name tokens,
 *      keeping only rows whose case number contains NUMBER/YEAR.
 *
 * `?probe=litigant:<name>` additionally runs an ad-hoc statewide litigant
 * search (used by the panel's search box).
 */

export const maxDuration = 45;

const DEFAULT_DAYS = 7;
const MAX_TRACKED = 10;

interface TapeEntry extends CauselistEntry {
  matchedCaseId: string | null;
  matchedCaseTitle: string | null;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function numberYearKey(caseNumber: string | null, caseYear: string | null) {
  if (!caseNumber || !caseYear) return null;
  return `${caseNumber.replace(/^0+/, "")}/${caseYear}`;
}

function entryMatchesNumberYear(e: CauselistEntry, key: string): boolean {
  return e.caseNumber.some((cn) => cn.replace(/\/0+/g, "/").endsWith(key));
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isCauselistConfigured()) {
    return NextResponse.json({
      configured: false,
      entries: [],
      note: "ECOURTSINDIA_MCP_URL not set",
    });
  }

  const url = new URL(request.url);
  const days = Math.min(
    parseInt(url.searchParams.get("days") || String(DEFAULT_DAYS), 10) ||
      DEFAULT_DAYS,
    14,
  );
  const probe = url.searchParams.get("probe");

  const start = new Date();
  const end = new Date(Date.now() + days * 86_400_000);
  const range = { startDate: isoDate(start), endDate: isoDate(end) };

  // Ad-hoc litigant probe (panel search box) — no case matching.
  if (probe?.startsWith("litigant:")) {
    const name = probe.slice("litigant:".length).trim();
    if (name.length < 3) {
      return NextResponse.json({ configured: true, entries: [] });
    }
    try {
      const found = await searchCauselist({ litigant: name, ...range });
      const entries: TapeEntry[] = found.map((e) => ({
        ...e,
        matchedCaseId: null,
        matchedCaseTitle: null,
      }));
      return NextResponse.json({ configured: true, entries });
    } catch (e) {
      return NextResponse.json(
        { error: `causelist search failed: ${String(e)}` },
        { status: 502 },
      );
    }
  }

  const { data: cases } = await supabase
    .from("cases")
    .select("id, case_title, case_type, case_number, case_year, petitioner")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(MAX_TRACKED);

  const byId = new Map<number, TapeEntry>();
  const errors: string[] = [];

  for (const c of cases || []) {
    const key = numberYearKey(c.case_number, c.case_year);
    if (!key) continue;

    try {
      // Pass 1: case-number free text.
      const qText = c.case_type ? `${c.case_type}/${key}` : key;
      let hits = (await searchCauselist({ q: qText, ...range })).filter((e) =>
        entryMatchesNumberYear(e, key),
      );

      // Case numbers collide across districts — when we know a party
      // name, keep only entries that mention it (first name token).
      if (hits.length && c.petitioner) {
        const token = c.petitioner.split(/\s+/)[0]?.toLowerCase();
        if (token && token.length >= 3) {
          const guarded = hits.filter((e) =>
            e.party.toLowerCase().includes(token),
          );
          if (guarded.length) hits = guarded;
        }
      }

      // Pass 2: lead-petitioner litigant search, filtered to this case no.
      if (!hits.length && c.petitioner) {
        const lead = c.petitioner.split(/\s+/).slice(0, 2).join(" ").trim();
        if (lead.length >= 3) {
          hits = (await searchCauselist({ litigant: lead, ...range })).filter(
            (e) => entryMatchesNumberYear(e, key),
          );
        }
      }

      for (const e of hits) {
        byId.set(e.id, {
          ...e,
          matchedCaseId: c.id as unknown as string,
          matchedCaseTitle: c.case_title,
        });
      }
    } catch (e) {
      errors.push(`${c.case_title || key}: ${String(e)}`);
    }
  }

  const entries = [...byId.values()].sort(
    (a, b) =>
      a.date.localeCompare(b.date) || (a.listingNo || 99) - (b.listingNo || 99),
  );

  return NextResponse.json({
    configured: true,
    entries,
    checked: (cases || []).length,
    range,
    ...(errors.length ? { errors } : {}),
  });
}
