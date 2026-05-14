/**
 * CourtListener API adapter — fetches opinion clusters from US federal
 * courts via the v4 search endpoint.
 *
 * Auth: Authorization: Token <COURTLISTENER_API_KEY>  (free signup,
 *       5000 req/hr cap as of 2026)
 * API base: https://www.courtlistener.com/api/rest/v4/search/?type=o
 *
 * Free tier was eliminated for unauthenticated traffic — every call
 * now returns HTTP 401 unless the bearer token is present.
 */

const CL_API_BASE = "https://www.courtlistener.com/api/rest/v4";

/** Subset of CourtListener court identifiers we ingest by default.
 *  Mirrors the major federal appellate + Supreme Court bench. */
export const CL_COURTS: Record<string, string> = {
  scotus: "Supreme Court of the United States",
  ca1: "First Circuit Court of Appeals",
  ca2: "Second Circuit Court of Appeals",
  ca3: "Third Circuit Court of Appeals",
  ca4: "Fourth Circuit Court of Appeals",
  ca5: "Fifth Circuit Court of Appeals",
  ca6: "Sixth Circuit Court of Appeals",
  ca7: "Seventh Circuit Court of Appeals",
  ca8: "Eighth Circuit Court of Appeals",
  ca9: "Ninth Circuit Court of Appeals",
  ca10: "Tenth Circuit Court of Appeals",
  ca11: "Eleventh Circuit Court of Appeals",
  cadc: "D.C. Circuit Court of Appeals",
  cafc: "Federal Circuit Court of Appeals",
};

export type CLCourtId = keyof typeof CL_COURTS;

/** Shape of one result in the CL v4 search response (type=o). */
export interface CLSearchResult {
  cluster_id?: number;
  caseName?: string;
  court?: string;
  court_id?: string;
  dateFiled?: string;
  citation?: string[];
  judge?: string;
  snippet?: string;
  status?: string;
  absolute_url?: string;
  // CourtListener returns the opinion id in different keys depending on
  // result type; we accept any.
  id?: number;
  opinion_id?: number;
}

export interface CLSearchResponse {
  count?: number;
  next?: string | null;
  previous?: string | null;
  results?: CLSearchResult[];
}

/** Normalized record matching the `us_opinions` Supabase table. */
export interface USOpinionRecord {
  cl_id: number;
  cluster_id: number | null;
  court_id: string;
  court_name: string;
  case_name: string;
  citations: string[];
  date_filed: string | null;
  judge: string | null;
  snippet: string | null;
  status: string | null;
  absolute_url: string | null;
  source_url: string;
  raw_data: unknown;
}

function stripHtml(s: unknown): string {
  if (typeof s !== "string") return "";
  return s
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function pickCLId(r: CLSearchResult): number | null {
  if (typeof r.id === "number") return r.id;
  if (typeof r.opinion_id === "number") return r.opinion_id;
  if (typeof r.cluster_id === "number") return r.cluster_id;
  return null;
}

export async function fetchOpinionsForCourt(opts: {
  courtId: string;
  courtName: string;
  filedAfter: Date;
  pages?: number;
}): Promise<USOpinionRecord[]> {
  const apiKey = process.env.COURTLISTENER_API_KEY;
  if (!apiKey) {
    throw new Error("COURTLISTENER_API_KEY not set");
  }

  const { courtId, courtName, filedAfter, pages = 1 } = opts;
  const filedAfterStr = filedAfter.toISOString().slice(0, 10);

  const all: USOpinionRecord[] = [];

  for (let page = 1; page <= pages; page++) {
    const params = new URLSearchParams({
      type: "o",
      court: courtId,
      filed_after: filedAfterStr,
      order_by: "dateFiled desc",
      page: String(page),
    });
    const url = `${CL_API_BASE}/search/?${params.toString()}`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Token ${apiKey}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      throw new Error(
        `CL search failed for ${courtId}: HTTP ${res.status} ${res.statusText}`,
      );
    }

    const data = (await res.json()) as CLSearchResponse;
    const results = data.results || [];
    if (!results.length) break;

    for (const r of results) {
      const cl_id = pickCLId(r);
      if (cl_id === null) continue;
      const absolute_url = r.absolute_url || null;
      all.push({
        cl_id,
        cluster_id: typeof r.cluster_id === "number" ? r.cluster_id : null,
        court_id: courtId,
        court_name: courtName,
        case_name: stripHtml(r.caseName) || "Unknown",
        citations: Array.isArray(r.citation) ? r.citation : [],
        date_filed: r.dateFiled || null,
        judge: stripHtml(r.judge) || null,
        snippet: stripHtml(r.snippet) || null,
        status: r.status || null,
        absolute_url,
        source_url: absolute_url
          ? `https://www.courtlistener.com${absolute_url}`
          : `https://www.courtlistener.com/opinion/${cl_id}/`,
        raw_data: r,
      });
    }

    if (results.length < 20) break;
  }

  return all;
}

export async function fetchOpinionsForAllCourts(opts: {
  courts: string[];
  filedAfter: Date;
  pagesPerCourt?: number;
}): Promise<Map<string, USOpinionRecord[]>> {
  const results = new Map<string, USOpinionRecord[]>();

  await Promise.all(
    opts.courts.map(async (courtId) => {
      const courtName = CL_COURTS[courtId] || courtId;
      try {
        const ops = await fetchOpinionsForCourt({
          courtId,
          courtName,
          filedAfter: opts.filedAfter,
          pages: opts.pagesPerCourt ?? 1,
        });
        results.set(courtId, ops);
      } catch (err) {
        console.error(`[CL] Failed for ${courtId}:`, err);
        results.set(courtId, []);
      }
    }),
  );

  return results;
}
