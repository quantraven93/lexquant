import type { NewsSourceConfig } from "./types";

/**
 * Canonical RSS feed sources for the legal news aggregator.
 *
 * To add a new source: append an entry here and re-run the cron.
 * Feeds that 404 or parse-fail are logged and skipped so other sources
 * keep working.
 *
 * Sources verified live as of ship date (May 2026):
 *   - Bar & Bench, LawBeat, SCC Blog: standard WordPress / RSS 2.0
 *
 * LiveLaw and The Leaflet do not currently expose a working RSS feed
 * (LiveLaw has no public feed, Leaflet's /feed/ and /stories.rss return
 * channel metadata only). They need HTML scraper adapters added later.
 */
export const NEWS_SOURCES: NewsSourceConfig[] = [
  {
    code: "barandbench",
    name: "Bar & Bench",
    feedUrl: "https://www.barandbench.com/feed",
  },
  {
    code: "lawbeat",
    name: "LawBeat",
    feedUrl: "https://lawbeat.in/feed",
  },
  {
    code: "scc-blog",
    name: "SCC Blog",
    feedUrl: "https://www.scconline.com/blog/feed/",
  },
];

export const SOURCE_BADGES: Record<string, string> = {
  barandbench: "B&B",
  lawbeat: "LB",
  "scc-blog": "SCC",
  // Reserved for scraper-based sources added later:
  livelaw: "LL",
  leaflet: "LFT",
  prs: "PRS",
};
