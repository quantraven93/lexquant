import type { WatchlistSourceType } from "./types";

/**
 * Heuristically detect the source type of a watchlist URL.
 * Used when the caller doesn't pass an explicit source_type
 * (e.g., manual URL entry from the Add form).
 */
export function detectSourceType(url: string): {
  source_type: WatchlistSourceType;
  source_ref: string | null;
} {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();

    if (host.endsWith("indiankanoon.org")) {
      // https://indiankanoon.org/doc/<tid>/
      const match = u.pathname.match(/\/doc\/(\d+)/);
      return {
        source_type: "judgment",
        source_ref: match ? match[1] : null,
      };
    }

    if (
      host.endsWith("services.ecourts.gov.in") ||
      host.endsWith("ecourts.gov.in") ||
      host.endsWith("sci.gov.in") ||
      host.endsWith("main.sci.gov.in")
    ) {
      return { source_type: "case", source_ref: null };
    }

    if (
      host.endsWith("livelaw.in") ||
      host.endsWith("barandbench.com") ||
      host.endsWith("lawbeat.in") ||
      host.endsWith("scconline.com") ||
      host.endsWith("theleaflet.in") ||
      host.endsWith("prsindia.org")
    ) {
      return { source_type: "news", source_ref: null };
    }

    return { source_type: "url", source_ref: null };
  } catch {
    return { source_type: "url", source_ref: null };
  }
}
