/**
 * Indian Kanoon judge / author dossier. Given a judge name, pulls every
 * judgment IK has them attributed as the author of, plus light aggregates
 * (court breakdown, year span, top-cited rulings).
 *
 * Powered by IK's `/search/?formInput=author:"..."` query — same per-page
 * billing as the daily court ingest, so we cap maxpages aggressively.
 */

const IK_API_BASE = "https://api.indiankanoon.org";

const MAX_PAGES = 4; // 4 pages * 10 docs = up to 40 rulings per dossier load
const PAGE_SIZE = 10;

export interface JudgeDocSummary {
  tid: number;
  title: string;
  docsource: string | null;
  publishdate: string | null;
  citation: string | null;
  numcites: number;
  numcitedby: number;
  headline: string;
  source_url: string;
}

export interface CourtBreakdown {
  court: string;
  count: number;
}

export interface YearBreakdown {
  year: number;
  count: number;
}

export interface JudgeDossier {
  name: string;
  totalFound: number; // IK's "found" field — total matches even when only N returned
  returned: number;
  judgments: JudgeDocSummary[];
  courts: CourtBreakdown[];
  years: YearBreakdown[];
  totalCitations: number; // sum of numcitedby across returned rulings
  topCited: JudgeDocSummary[]; // top 5 by numcitedby
}

interface IKSearchDoc {
  tid: number;
  doctype: number;
  title: string;
  citation?: string;
  publishdate?: string;
  docsource?: string;
  headline?: string;
  numcites?: number;
  numcitedby?: number;
  author?: string;
  bench?: string[];
}

interface IKSearchResponse {
  docs?: IKSearchDoc[];
  found?: string;
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

function parseYear(publishdate: string | null | undefined): number | null {
  if (!publishdate) return null;
  const m = publishdate.match(/^(\d{4})/);
  return m ? Number(m[1]) : null;
}

export async function fetchJudgeDossier(name: string): Promise<JudgeDossier> {
  const apiKey = process.env.IK_API_KEY;
  if (!apiKey) throw new Error("IK_API_KEY not set");
  const cleanName = name.trim();
  if (!cleanName) throw new Error("Empty judge name");

  // Quote the author name so multi-word names match as a phrase.
  const formInput = `author:"${cleanName}" sortby:mostrecent`;

  const all: JudgeDocSummary[] = [];
  let totalFound = 0;

  for (let pagenum = 0; pagenum < MAX_PAGES; pagenum++) {
    const url = `${IK_API_BASE}/search/?formInput=${encodeURIComponent(
      formInput,
    )}&pagenum=${pagenum}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Token ${apiKey}` },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      throw new Error(`IK search failed: HTTP ${res.status}`);
    }
    const data = (await res.json()) as IKSearchResponse;
    if (data.found && pagenum === 0) {
      const parsed = Number.parseInt(data.found.replace(/[^\d]/g, ""), 10);
      if (Number.isFinite(parsed)) totalFound = parsed;
    }
    if (!data.docs?.length) break;
    for (const doc of data.docs) {
      all.push({
        tid: doc.tid,
        title: stripBoldTags(doc.title),
        docsource: doc.docsource || null,
        publishdate: doc.publishdate || null,
        citation: doc.citation || null,
        numcites: doc.numcites || 0,
        numcitedby: doc.numcitedby || 0,
        headline: stripBoldTags(doc.headline),
        source_url: `https://indiankanoon.org/doc/${doc.tid}/`,
      });
    }
    if (data.docs.length < PAGE_SIZE) break;
  }

  // Court breakdown.
  const courtMap = new Map<string, number>();
  for (const j of all) {
    if (!j.docsource) continue;
    courtMap.set(j.docsource, (courtMap.get(j.docsource) || 0) + 1);
  }
  const courts: CourtBreakdown[] = Array.from(courtMap.entries())
    .map(([court, count]) => ({ court, count }))
    .sort((a, b) => b.count - a.count);

  // Year breakdown.
  const yearMap = new Map<number, number>();
  for (const j of all) {
    const y = parseYear(j.publishdate);
    if (y == null) continue;
    yearMap.set(y, (yearMap.get(y) || 0) + 1);
  }
  const years: YearBreakdown[] = Array.from(yearMap.entries())
    .map(([year, count]) => ({ year, count }))
    .sort((a, b) => b.year - a.year);

  const totalCitations = all.reduce((sum, j) => sum + j.numcitedby, 0);

  const topCited = [...all]
    .sort((a, b) => b.numcitedby - a.numcitedby)
    .slice(0, 5);

  return {
    name: cleanName,
    totalFound: totalFound || all.length,
    returned: all.length,
    judgments: all,
    courts,
    years,
    totalCitations,
    topCited,
  };
}
