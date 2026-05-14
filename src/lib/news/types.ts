/**
 * News types — RSS aggregator pipeline.
 *
 * Pulls legal news from publisher RSS feeds (LiveLaw, Bar & Bench, LawBeat,
 * SCC Blog, The Leaflet) and upserts into the `news_items` table for the
 * News tab on the Live Digest panel.
 */

export type NewsSource =
  | "livelaw"
  | "barandbench"
  | "lawbeat"
  | "scc-blog"
  | "leaflet";

export interface NewsSourceConfig {
  code: NewsSource;
  name: string;
  feedUrl: string;
}

export interface NewsRecord {
  guid: string;
  source: NewsSource;
  source_name: string;
  title: string;
  link: string;
  summary: string | null;
  author: string | null;
  categories: string[];
  published_at: string | null;
}
