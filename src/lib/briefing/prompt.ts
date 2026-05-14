interface CaseLine {
  case_title: string | null;
  court_name: string | null;
  case_type: string | null;
  case_number: string;
  case_year: string | null;
  next_hearing_date: string | null;
  current_status: string | null;
}

interface JudgmentLine {
  court_name: string;
  title: string;
  citation: string | null;
  publish_date: string | null;
}

interface NewsLine {
  source_name: string;
  title: string;
  published_at: string | null;
}

interface WatchLine {
  label: string;
  source_type: string | null;
  added_at: string;
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
    });
  } catch {
    return d;
  }
}

export function buildBriefingPrompt(input: {
  briefingDateIST: string;
  cases: CaseLine[];
  judgments: JudgmentLine[];
  news: NewsLine[];
  watchlist: WatchLine[];
}): string {
  const { briefingDateIST, cases, judgments, news, watchlist } = input;

  const casesBlock =
    cases.length === 0
      ? "(no tracked cases)"
      : cases
          .slice(0, 20)
          .map((c) => {
            const cn = [c.case_type, c.case_number, c.case_year]
              .filter(Boolean)
              .join(" ");
            return `- ${c.case_title || cn} [${c.court_name || "?"}] · status: ${c.current_status || "?"} · next hearing: ${fmtDate(c.next_hearing_date)}`;
          })
          .join("\n");

  const judgmentsBlock =
    judgments.length === 0
      ? "(no new judgments)"
      : judgments
          .slice(0, 10)
          .map(
            (j) =>
              `- [${j.court_name}] ${j.title}${j.citation ? ` · ${j.citation}` : ""} (${fmtDate(j.publish_date)})`,
          )
          .join("\n");

  const newsBlock =
    news.length === 0
      ? "(no news)"
      : news
          .slice(0, 10)
          .map(
            (n) =>
              `- [${n.source_name}] ${n.title} (${fmtDate(n.published_at)})`,
          )
          .join("\n");

  const watchBlock =
    watchlist.length === 0
      ? "(no watchlist items)"
      : watchlist
          .slice(0, 10)
          .map((w) => `- ${w.label} (${w.source_type || "url"})`)
          .join("\n");

  return [
    `You are the briefing writer for an Indian litigator's "Bloomberg for law" terminal. Write a concise morning briefing for ${briefingDateIST}.`,
    "",
    "TRACKED CASES:",
    casesBlock,
    "",
    "FRESH JUDGMENTS (last 24h):",
    judgmentsBlock,
    "",
    "LEGAL NEWS (last 24h):",
    newsBlock,
    "",
    "WATCHLIST:",
    watchBlock,
    "",
    "Write the briefing in 3-5 short paragraphs:",
    "1. Hearings & deadlines today/this week from tracked cases (skip if none).",
    "2. Most consequential new judgment(s) for the litigator's likely practice area. Explain why it matters in plain language.",
    "3. Legal news worth their attention. Skip celebrity / non-substantive.",
    "4. Any watchlist movement.",
    "",
    "Rules:",
    "- Plain prose, no markdown headers, no bullet lists.",
    "- Do NOT pad. If a section has nothing, drop it entirely.",
    "- Use Indian English. Avoid intensifiers (clearly, obviously). Cite case names + courts inline.",
    "- Length cap: ~250 words total.",
  ].join("\n");
}
