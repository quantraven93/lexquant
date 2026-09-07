/**
 * Indian Kanoon API adapter — fetches judgments for the Live Digest panel.
 *
 * IK API: https://api.indiankanoon.org/search/?formInput=<encoded>&pagenum=<n>
 * Auth: Authorization: Token <IK_API_KEY>
 * Method: POST (with no body)
 *
 * Form input grammar (space-separated, then URL-encoded):
 *   <query> doctypes:<court> fromdate:DD-MM-YYYY todate:DD-MM-YYYY sortby:mostrecent
 */

import type { IKDoc, JudgmentRecord } from "./judgment-types";

const IK_API_BASE = "https://api.indiankanoon.org";

/** IK doctype codes mapped to display names. */
export const IK_COURTS = {
  supremecourt: "Supreme Court of India",
  scorders: "Supreme Court — Daily Orders",
  bombay: "Bombay High Court",
  delhi: "Delhi High Court",
  chennai: "Madras High Court",
  // IK spells the Karnataka HC doctype 'karnataka'. 'bangalore' is NOT a
  // valid doctype (verified 2026-09-07) — see IK_DOCSOURCE below for what
  // IK does with an invalid one.
  karnataka: "Karnataka High Court",
  allahabad: "Allahabad High Court",
  kolkata_app: "Calcutta High Court (Appellate)",
  madhyapradesh: "Madhya Pradesh High Court",
  punjab: "Punjab & Haryana High Court",
  jodhpur: "Rajasthan High Court — Jodhpur",
  // IK spells the AP HC doctype 'amravati' (verified via IK facets,
  // June 2026 — 'andhra' returns nothing for the post-2019 court).
  amravati: "Andhra Pradesh High Court — Amaravati",
  telangana: "Telangana High Court",
} as const;

export type IKCourtCode = keyof typeof IK_COURTS;

/**
 * The exact `docsource` IK stamps on a document for each doctype. These are
 * IK's own strings, not our display names, and they differ in places — note
 * IK's own misspelling in "Appellete Side". Verified against the live API on
 * 2026-09-07, ten documents per code.
 */
export const IK_DOCSOURCE: Record<IKCourtCode, string> = {
  supremecourt: "Supreme Court of India",
  scorders: "Supreme Court - Daily Orders",
  bombay: "Bombay High Court",
  delhi: "Delhi High Court",
  chennai: "Madras High Court",
  karnataka: "Karnataka High Court",
  allahabad: "Allahabad High Court",
  kolkata_app: "Calcutta High Court (Appellete Side)",
  madhyapradesh: "Madhya Pradesh High Court",
  punjab: "Punjab-Haryana High Court",
  jodhpur: "Rajasthan High Court - Jodhpur",
  amravati: "Andhra Pradesh High Court - Amravati",
  telangana: "Telangana High Court",
};

/**
 * Reject a response we cannot attribute to the court we asked for.
 *
 * An unrecognised doctype is NOT an error to the IK API. It silently drops
 * the filter and returns an unfiltered result set, so the caller receives
 * ten real judgments from ten unrelated courts and stamps every one of them
 * with the court it asked for. Verified 2026-09-07: an invented
 * `doctypes:zzzznotacourt` returned the same 3,153-hit set as the equally
 * invalid `doctypes:bangalore`, whose page carried Madhya Pradesh, Andhra
 * Pradesh, Chattisgarh and Gauhati documents. 811 of the 4,576 rows then in
 * `judgments` were mislabelled "Karnataka High Court" that way.
 *
 * A correctly filtered IK response is entirely one docsource, so any stray
 * means the filter did not apply and the whole page is unattributable. That
 * is a failed fetch, not data — the same rule the case scrapers apply with
 * their `parsedAnything` guard. If IK ever renames a court, this fails
 * loudly for that one court instead of quietly poisoning the corpus.
 */
export function attributeDocs(
  courtCode: IKCourtCode,
  docs: IKDoc[],
): IKDoc[] {
  const expected = IK_DOCSOURCE[courtCode];
  const strays = docs.filter((doc) => (doc.docsource ?? "") !== expected);

  if (strays.length > 0) {
    const seen = [
      ...new Set(strays.map((doc) => doc.docsource || "(no docsource)")),
    ];
    throw new Error(
      `IK returned documents doctypes:${courtCode} did not ask for: ` +
        `expected "${expected}", but ${strays.length} of ${docs.length} came ` +
        `from [${seen.join(", ")}]. Treating as a failed fetch — an ` +
        `unrecognised doctype makes IK drop the filter silently.`,
    );
  }

  return docs;
}

function formatIKDate(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}-${month}-${d.getFullYear()}`;
}

function stripBoldTags(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/<\/?b>/gi, "")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

/** IK returns a fixed ten documents per page. */
export const IK_PAGE_SIZE = 10;

/**
 * IK reports the size of the whole result set in `found`, as the human
 * string "1 - 10 of 732" (or "No matching results"). Until now the ingest
 * destructured this field and threw it away, so it had no idea it was
 * taking ten of seven hundred.
 *
 * Returns null when the string is in a shape we do not recognise, so an IK
 * format change reads as "unknown", never as a confident zero.
 */
export function parseFoundTotal(found: string | undefined): number | null {
  if (!found) return null;
  if (/no matching results/i.test(found)) return 0;
  const match = found.match(/of\s+([\d,]+)\s*$/i);
  if (!match) return null;
  const n = Number.parseInt(match[1].replace(/,/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * What one court's fetch actually produced, as opposed to what it could
 * have. `truncated` is the honest signal: the ingest is capped at
 * `pages * IK_PAGE_SIZE`, so a busy court silently contributes a fraction
 * of its judgments unless someone is looking at this number.
 */
export interface CourtFetchResult {
  records: JudgmentRecord[];
  /** IK's total hit count for the window; null if unparseable. */
  found: number | null;
  /** True when IK holds more for this window than we asked for. */
  truncated: boolean;
  pagesFetched: number;
  /** Set when the court failed; records is then empty. */
  error?: string;
}

export async function fetchJudgmentsForCourt(opts: {
  courtCode: IKCourtCode;
  fromDate: Date;
  toDate: Date;
  pages?: number;
}): Promise<CourtFetchResult> {
  const { courtCode, fromDate, toDate, pages = 1 } = opts;
  const apiKey = process.env.IK_API_KEY;

  if (!apiKey) {
    throw new Error("IK_API_KEY environment variable is not set");
  }

  const courtName = IK_COURTS[courtCode];
  const formInput = [
    "judgment",
    `doctypes:${courtCode}`,
    `fromdate:${formatIKDate(fromDate)}`,
    `todate:${formatIKDate(toDate)}`,
    "sortby:mostrecent",
  ].join(" ");

  const all: JudgmentRecord[] = [];
  let found: number | null = null;
  let pagesFetched = 0;

  for (let pagenum = 0; pagenum < pages; pagenum++) {
    const url = `${IK_API_BASE}/search/?formInput=${encodeURIComponent(
      formInput,
    )}&pagenum=${pagenum}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Token ${apiKey}` },
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new Error(
        `IK API failed: ${response.status} ${response.statusText} for ${courtCode}`,
      );
    }

    const data: { docs?: IKDoc[]; found?: string } = await response.json();
    pagesFetched++;
    // Only page 0 carries the total for the whole window.
    if (pagenum === 0) found = parseFoundTotal(data.found);
    if (!data.docs?.length) break;

    const docs = attributeDocs(courtCode, data.docs);

    for (const doc of docs) {
      all.push({
        ik_tid: doc.tid,
        doctype: doc.doctype,
        court_code: courtCode,
        court_name: courtName,
        title: stripBoldTags(doc.title),
        citation: doc.citation || null,
        publish_date: doc.publishdate || null,
        author: doc.author || null,
        bench: doc.bench || [],
        numcites: doc.numcites || 0,
        numcitedby: doc.numcitedby || 0,
        headline: stripBoldTags(doc.headline),
        fragment_text: typeof doc.fragment === "string" ? doc.fragment : null,
        source_url: `https://indiankanoon.org/doc/${doc.tid}/`,
        raw_data: doc,
      });
    }

    if (docs.length < IK_PAGE_SIZE) break;
  }

  return {
    records: all,
    found,
    truncated: found !== null && all.length < found,
    pagesFetched,
  };
}

export async function fetchJudgmentsForAllCourts(opts: {
  courts: IKCourtCode[];
  fromDate: Date;
  toDate: Date;
  pagesPerCourt?: number;
}): Promise<Map<IKCourtCode, CourtFetchResult>> {
  const results = new Map<IKCourtCode, CourtFetchResult>();

  await Promise.all(
    opts.courts.map(async (court) => {
      try {
        results.set(
          court,
          await fetchJudgmentsForCourt({
            courtCode: court,
            fromDate: opts.fromDate,
            toDate: opts.toDate,
            pages: opts.pagesPerCourt ?? 1,
          }),
        );
      } catch (err) {
        // One court failing must not end the run, but it must not read as
        // "this court published nothing" either — the reason is carried.
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[IK] Failed for ${court}: ${message}`);
        results.set(court, {
          records: [],
          found: null,
          truncated: false,
          pagesFetched: 0,
          error: message,
        });
      }
    }),
  );

  return results;
}
