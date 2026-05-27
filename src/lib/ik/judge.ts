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
  bench: string[]; // co-sitting judges on this judgment, as returned by IK
}

export interface CourtBreakdown {
  court: string;
  count: number;
}

export interface YearBreakdown {
  year: number;
  count: number;
}

export interface BenchCoOccurrence {
  judge: string;
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
  /** Co-sitting judges across this judge's rulings — bias signal. Self excluded. */
  benchCoOccurrence: BenchCoOccurrence[];
  /** Authored opinions in the last 90 days, capped at 10, most recent first. */
  recentActivity: JudgeDocSummary[];
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
        bench: Array.isArray(doc.bench) ? doc.bench.map(stripBoldTags) : [],
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

  // Bench co-occurrence — names this judge has shared a bench with, ranked.
  // We compare normalized forms so e.g. "Justice X" and "X" collapse, but
  // surface the longest seen variant for display.
  const cleanLower = cleanName.toLowerCase();
  const benchMap = new Map<string, { display: string; count: number }>();
  for (const j of all) {
    const seenThisDoc = new Set<string>();
    for (const raw of j.bench) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      // Skip self — same judge often shows up in their own bench list.
      if (
        key === cleanLower ||
        key.includes(cleanLower) ||
        cleanLower.includes(key)
      ) {
        continue;
      }
      if (seenThisDoc.has(key)) continue;
      seenThisDoc.add(key);
      const prior = benchMap.get(key);
      if (prior) {
        prior.count += 1;
        if (trimmed.length > prior.display.length) prior.display = trimmed;
      } else {
        benchMap.set(key, { display: trimmed, count: 1 });
      }
    }
  }
  const benchCoOccurrence: BenchCoOccurrence[] = Array.from(benchMap.values())
    .map((v) => ({ judge: v.display, count: v.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Recent activity — last 90 days from the most recent ruling we saw.
  const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const recentActivity = all
    .filter((j) => {
      if (!j.publishdate) return false;
      const t = Date.parse(j.publishdate);
      if (!Number.isFinite(t)) return false;
      return now - t <= ninetyDaysMs;
    })
    .sort((a, b) => {
      const ta = a.publishdate ? Date.parse(a.publishdate) : 0;
      const tb = b.publishdate ? Date.parse(b.publishdate) : 0;
      return tb - ta;
    })
    .slice(0, 10);

  return {
    name: cleanName,
    totalFound: totalFound || all.length,
    returned: all.length,
    judgments: all,
    courts,
    years,
    totalCitations,
    topCited,
    benchCoOccurrence,
    recentActivity,
  };
}
