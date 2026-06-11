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
  bangalore: "Karnataka High Court",
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

export async function fetchJudgmentsForCourt(opts: {
  courtCode: IKCourtCode;
  fromDate: Date;
  toDate: Date;
  pages?: number;
}): Promise<JudgmentRecord[]> {
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
    if (!data.docs?.length) break;

    for (const doc of data.docs) {
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

    if (data.docs.length < 10) break;
  }

  return all;
}

export async function fetchJudgmentsForAllCourts(opts: {
  courts: IKCourtCode[];
  fromDate: Date;
  toDate: Date;
  pagesPerCourt?: number;
}): Promise<Map<IKCourtCode, JudgmentRecord[]>> {
  const results = new Map<IKCourtCode, JudgmentRecord[]>();

  await Promise.all(
    opts.courts.map(async (court) => {
      try {
        const judgments = await fetchJudgmentsForCourt({
          courtCode: court,
          fromDate: opts.fromDate,
          toDate: opts.toDate,
          pages: opts.pagesPerCourt ?? 1,
        });
        results.set(court, judgments);
      } catch (err) {
        console.error(`[IK] Failed for ${court}:`, err);
        results.set(court, []);
      }
    }),
  );

  return results;
}
