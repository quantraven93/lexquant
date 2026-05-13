/**
 * Judgment types — for Indian Kanoon ingest pipeline.
 *
 * Distinct from CaseStatus (user-tracked cases). Judgments are public
 * decisions ingested from external sources for the Live Digest panel.
 */

/** Raw IK API response document shape (subset we use). */
export interface IKDoc {
  tid: number;
  doctype?: number;
  catids?: number[] | null;
  publishdate?: string;
  authorid?: number | null;
  author?: string;
  authorEncoded?: string;
  bench?: number[];
  title?: string;
  numcites?: number;
  numcitedby?: number;
  headline?: string;
  fragment?: boolean | string;
  docsource?: string;
  docsize?: number;
  citation?: string;
}

/** Normalized judgment record matching the `judgments` Supabase table. */
export interface JudgmentRecord {
  ik_tid: number;
  doctype?: number;
  court_code: string;
  court_name: string;
  title: string;
  citation: string | null;
  publish_date: string | null;
  author: string | null;
  bench: number[];
  numcites: number;
  numcitedby: number;
  headline: string;
  fragment_text: string | null;
  source_url: string;
  raw_data: unknown;
}
