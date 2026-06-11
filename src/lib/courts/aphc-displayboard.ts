/**
 * AP High Court (Amaravati) live display board.
 *
 * Official source: https://aphc.gov.in/Hcdbs/displaytext.jsp — a plain GET
 * (no auth, no captcha) that the court's own display-board page polls every
 * 60 seconds. Response format: rows separated by `$`, fields by `@`:
 *
 *   [0] court hall number
 *   [2] current item number ('-' = not in session, 'D-0' = session
 *       started but no item called yet)
 *   [4] coram (judges sitting)
 *   [6] kept-back cases
 *
 * Each court number also has a per-court cause list at
 * getCourtCauseList.action?court=<n> (future use).
 */

const BOARD_URL = "https://aphc.gov.in/Hcdbs/displaytext.jsp";

export interface BoardRow {
  court: string;
  status: "not_in_session" | "session_started" | "hearing";
  item: string | null;
  coram: string | null;
  keptBack: string | null;
}

export async function fetchDisplayBoard(): Promise<BoardRow[]> {
  const res = await fetch(BOARD_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`APHC display board: HTTP ${res.status}`);
  }
  const text = (await res.text()).trim();
  if (!text) return [];

  const rows: BoardRow[] = [];
  for (const chunk of text.split("$")) {
    const f = chunk.split("@");
    if (!f[0]) continue;
    const item = (f[2] ?? "").trim();
    let status: BoardRow["status"] = "hearing";
    if (item === "-" || item === "") status = "not_in_session";
    else if (item === "D-0") status = "session_started";
    rows.push({
      court: f[0].trim(),
      status,
      item: status === "hearing" ? item : null,
      coram: (f[4] ?? "").trim().replace(/^-$/, "") || null,
      keptBack: (f[6] ?? "").trim().replace(/^-$/, "") || null,
    });
  }

  // Court halls arrive interleaved (1, 11, 21, 31, 2, 12, ...) — sort
  // numerically, keeping any non-numeric halls at the end.
  return rows.sort((a, b) => {
    const an = parseInt(a.court, 10);
    const bn = parseInt(b.court, 10);
    if (Number.isNaN(an) || Number.isNaN(bn)) return Number.isNaN(an) ? 1 : -1;
    return an - bn;
  });
}
