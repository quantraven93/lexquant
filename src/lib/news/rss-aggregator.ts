/**
 * RSS aggregator — fetches legal news feeds and normalizes to NewsRecord.
 *
 * Uses fast-xml-parser to handle RSS 2.0 / Atom variants across publishers.
 * Any single feed failure is logged and skipped so the cron run still
 * produces a partial result instead of failing hard.
 */

import { XMLParser } from "fast-xml-parser";
import { NEWS_SOURCES } from "./sources";
import type { NewsRecord, NewsSourceConfig } from "./types";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  cdataPropName: "__cdata",
  trimValues: true,
});

const USER_AGENT = "LexQuant-NewsAggregator/1.0 (+https://lexquant.vercel.app)";

function stripHtml(s: unknown): string {
  if (typeof s !== "string") return "";
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function unwrap(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.__cdata === "string") return o.__cdata;
    if (typeof o["#text"] === "string") return o["#text"] as string;
    if (typeof o["@_href"] === "string") return o["@_href"] as string;
  }
  return "";
}

function toArray<T>(v: T | T[] | undefined): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function parseDate(s: string): string | null {
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function truncate(s: string, max = 400): string {
  if (s.length <= max) return s;
  return s.slice(0, max).trim() + "…";
}

interface RawItem {
  title?: unknown;
  link?: unknown | unknown[];
  guid?: unknown;
  description?: unknown;
  summary?: unknown;
  "content:encoded"?: unknown;
  content?: unknown;
  pubDate?: unknown;
  published?: unknown;
  updated?: unknown;
  "dc:creator"?: unknown;
  author?: unknown;
  category?: unknown | unknown[];
}

function normalizeItem(
  raw: RawItem,
  source: NewsSourceConfig,
): NewsRecord | null {
  const title = stripHtml(unwrap(raw.title));
  if (!title) return null;

  const linkRaw = raw.link;
  let link = "";
  if (Array.isArray(linkRaw)) {
    const first = linkRaw.find((l) => unwrap(l));
    link = unwrap(first);
  } else {
    link = unwrap(linkRaw);
  }
  if (!link) return null;

  const guidRaw = unwrap(raw.guid);
  const guid = guidRaw || link;

  const descSource =
    raw["content:encoded"] ?? raw.content ?? raw.description ?? raw.summary;
  const summary = truncate(stripHtml(unwrap(descSource)));

  const author =
    stripHtml(unwrap(raw["dc:creator"])) ||
    stripHtml(unwrap(raw.author)) ||
    null;

  const dateStr =
    unwrap(raw.pubDate) || unwrap(raw.published) || unwrap(raw.updated);
  const published_at = parseDate(dateStr);

  const categoryRaw = raw.category;
  const categories = toArray(categoryRaw)
    .map((c) => stripHtml(unwrap(c)))
    .filter(Boolean);

  return {
    guid,
    source: source.code,
    source_name: source.name,
    title,
    link,
    summary: summary || null,
    author: author || null,
    categories,
    published_at,
  };
}

export async function fetchFeed(
  source: NewsSourceConfig,
  timeoutMs = 15_000,
): Promise<NewsRecord[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(source.feedUrl, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/rss+xml, application/xml, text/xml",
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const xml = await res.text();
    const parsed = parser.parse(xml);

    // RSS 2.0: rss.channel.item[]
    // Atom: feed.entry[]
    const items: RawItem[] =
      toArray(parsed?.rss?.channel?.item) ?? toArray(parsed?.feed?.entry) ?? [];

    const records = items
      .map((it) => normalizeItem(it, source))
      .filter((r): r is NewsRecord => r !== null);

    // Dedup within a single feed by guid
    const byGuid = new Map<string, NewsRecord>();
    for (const r of records) byGuid.set(r.guid, r);
    return Array.from(byGuid.values());
  } finally {
    clearTimeout(timer);
  }
}

export interface AggregateResult {
  records: NewsRecord[];
  breakdown: Record<string, number>;
  errors: Array<{ source: string; error: string }>;
}

export async function fetchAllFeeds(
  sources: NewsSourceConfig[] = NEWS_SOURCES,
): Promise<AggregateResult> {
  const settled = await Promise.allSettled(
    sources.map(async (s) => ({ source: s, records: await fetchFeed(s) })),
  );

  const records: NewsRecord[] = [];
  const breakdown: Record<string, number> = {};
  const errors: Array<{ source: string; error: string }> = [];

  for (let i = 0; i < settled.length; i++) {
    const s = sources[i];
    const r = settled[i];
    if (r.status === "fulfilled") {
      breakdown[s.code] = r.value.records.length;
      records.push(...r.value.records);
    } else {
      breakdown[s.code] = 0;
      errors.push({
        source: s.code,
        error: r.reason instanceof Error ? r.reason.message : String(r.reason),
      });
    }
  }

  return { records, breakdown, errors };
}
