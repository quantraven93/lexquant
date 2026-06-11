/**
 * Supreme Court of India live display board.
 *
 * Official source: https://wdb.sci.gov.in/ (the "Display Board Module
 * (New)" linked from sci.gov.in → Services → Display Boards). The page
 * polls POST get_board.php?ctype=c, which returns a server-rendered HTML
 * table: Court | Message | Item No. | Case No. | Cause Title | Advocates.
 *
 * Richer than the AP HC board — in session it carries the case number,
 * cause title and appearing advocates for the item being heard.
 */

const BOARD_URL = "https://wdb.sci.gov.in/get_board.php?ctype=c";

export interface SciBoardRow {
  court: string;
  status: "not_in_session" | "hearing";
  message: string | null;
  item: string | null;
  caseNo: string | null;
  causeTitle: string | null;
  advocates: string | null;
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function clean(s: string | undefined): string | null {
  const t = stripTags(s ?? "");
  return t && t !== "-" ? t : null;
}

export async function fetchSciDisplayBoard(): Promise<SciBoardRow[]> {
  const res = await fetch(BOARD_URL, {
    method: "POST",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      Referer: "https://wdb.sci.gov.in/",
      "X-Requested-With": "XMLHttpRequest",
    },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`SCI display board: HTTP ${res.status}`);
  }
  const html = await res.text();

  const rows: SciBoardRow[] = [];
  for (const m of html.matchAll(/<tr class="record">([\s\S]*?)<\/tr>/g)) {
    const cells = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(
      (c) => c[1],
    );
    if (!cells.length) continue;
    const court = stripTags(cells[0] ?? "");
    if (!court) continue;

    const rowText = stripTags(m[1]).toLowerCase();
    if (rowText.includes("not in session")) {
      rows.push({
        court,
        status: "not_in_session",
        message: clean(cells[1]),
        item: null,
        caseNo: null,
        causeTitle: null,
        advocates: null,
      });
      continue;
    }

    rows.push({
      court,
      status: "hearing",
      message: clean(cells[1]),
      item: clean(cells[2]),
      caseNo: clean(cells[3]),
      causeTitle: clean(cells[4]),
      // Advocates may span the trailing cells depending on layout.
      advocates:
        clean(cells.slice(5).map(stripTags).filter(Boolean).join(" · ")) ??
        null,
    });
  }

  return rows.sort((a, b) => {
    const an = parseInt(a.court, 10);
    const bn = parseInt(b.court, 10);
    if (Number.isNaN(an) || Number.isNaN(bn)) return Number.isNaN(an) ? 1 : -1;
    return an - bn;
  });
}
