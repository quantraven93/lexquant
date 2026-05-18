"use client";

import { useEffect, useState } from "react";
import { SOURCE_BADGES } from "@/lib/news/sources";

interface Judgment {
  id: string;
  ik_tid: number;
  court_code: string;
  court_name: string;
  title: string;
  citation: string | null;
  publish_date: string | null;
  author: string | null;
  headline: string;
  source_url: string;
}

interface NewsItem {
  id: string;
  source: string;
  source_name: string;
  title: string;
  link: string;
  summary: string | null;
  author: string | null;
  categories: string[];
  published_at: string | null;
}

type Tab = "judgments" | "news";

const COURT_BADGES: Record<string, string> = {
  supremecourt: "SC",
  scorders: "SC.O",
  bombay: "BHC",
  delhi: "DHC",
  chennai: "MAD",
  bangalore: "KHC",
  allahabad: "AHC",
  kolkata_app: "CHC",
  madhyapradesh: "MPHC",
  punjab: "P&H",
  jodhpur: "RAJ",
};

const ROW_STYLE: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "60px 1fr auto",
  gap: "0.5rem",
  alignItems: "baseline",
  padding: "0.4rem 0.75rem",
  borderBottom: "1px solid rgba(0,0,0,0.05)",
  fontSize: "0.72rem",
};

const BADGE_STYLE: React.CSSProperties = {
  fontFamily: "var(--bb-font, monospace)",
  fontSize: "0.6rem",
  letterSpacing: "0.06em",
  color: "var(--bb-amber-dim)",
  fontWeight: 600,
};

const DATE_STYLE: React.CSSProperties = {
  fontFamily: "var(--bb-font, monospace)",
  fontSize: "0.6rem",
  color: "var(--bb-gray)",
  whiteSpace: "nowrap",
};

function EmptyState({ message }: { message: string }) {
  return (
    <div
      style={{
        padding: "1.5rem",
        textAlign: "center",
        color: "var(--bb-gray)",
        fontSize: "0.7rem",
        letterSpacing: "0.08em",
      }}
    >
      {message}
    </div>
  );
}

function TabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: "transparent",
        border: "none",
        cursor: "pointer",
        fontFamily: "var(--bb-font, monospace)",
        fontSize: "0.62rem",
        fontWeight: active ? 700 : 500,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: active ? "var(--bb-amber-dim)" : "var(--bb-gray)",
        padding: "0.2rem 0.5rem",
        borderBottom: active
          ? "2px solid var(--bb-amber)"
          : "2px solid transparent",
        marginBottom: "-1px",
      }}
    >
      {label}
    </button>
  );
}

export function LiveDigest({ limit = 10 }: { limit?: number }) {
  const [tab, setTab] = useState<Tab>("judgments");
  const [judgments, setJudgments] = useState<Judgment[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loadingJ, setLoadingJ] = useState(true);
  const [loadingN, setLoadingN] = useState(true);

  useEffect(() => {
    fetch(`/api/judgments?limit=${limit}`)
      .then((r) => r.json())
      .then((data) => {
        setJudgments(data.judgments || []);
        setLoadingJ(false);
      })
      .catch(() => setLoadingJ(false));
  }, [limit]);

  useEffect(() => {
    fetch(`/api/news?limit=${limit}`)
      .then((r) => r.json())
      .then((data) => {
        setNews(data.news || []);
        setLoadingN(false);
      })
      .catch(() => setLoadingN(false));
  }, [limit]);

  return (
    <div className="bb-panel">
      <div
        className="bb-panel-header"
        style={{ alignItems: "stretch", paddingTop: 0, paddingBottom: 0 }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <span className="bb-panel-title">Live Digest</span>
          <span style={{ display: "flex", gap: "0.25rem" }}>
            <TabButton
              active={tab === "judgments"}
              label="Judgments"
              onClick={() => setTab("judgments")}
            />
            <TabButton
              active={tab === "news"}
              label="News"
              onClick={() => setTab("news")}
            />
          </span>
        </div>
        <span className="bb-panel-tag">Live</span>
      </div>

      {tab === "judgments" &&
        (loadingJ ? (
          <EmptyState message="[LOADING JUDGMENTS...]" />
        ) : judgments.length === 0 ? (
          <EmptyState message="NO JUDGMENTS · run cron to populate" />
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {judgments.map((j) => (
              <li key={j.id} style={ROW_STYLE}>
                <span style={BADGE_STYLE}>
                  {COURT_BADGES[j.court_code] ||
                    j.court_code.slice(0, 4).toUpperCase()}
                </span>
                <a
                  href={j.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: "var(--bb-white)",
                    fontFamily: "var(--bb-font-serif, Georgia, serif)",
                    textDecoration: "none",
                    lineHeight: 1.4,
                  }}
                >
                  {j.title}
                  {j.citation ? (
                    <span
                      style={{
                        color: "var(--bb-gray)",
                        fontFamily: "var(--bb-font, monospace)",
                        fontSize: "0.62rem",
                        marginLeft: "0.5rem",
                      }}
                    >
                      · {j.citation}
                    </span>
                  ) : null}
                </a>
                <span style={DATE_STYLE}>
                  {j.publish_date
                    ? new Date(j.publish_date).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                      })
                    : "—"}
                </span>
              </li>
            ))}
          </ul>
        ))}

      {tab === "news" &&
        (loadingN ? (
          <EmptyState message="[LOADING NEWS...]" />
        ) : news.length === 0 ? (
          <EmptyState message="NO NEWS · run cron to populate" />
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {news.map((n) => (
              <li key={n.id} style={ROW_STYLE}>
                <span style={BADGE_STYLE}>
                  {SOURCE_BADGES[n.source] ||
                    n.source.slice(0, 4).toUpperCase()}
                </span>
                <a
                  href={n.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: "var(--bb-white)",
                    fontFamily: "var(--bb-font-serif, Georgia, serif)",
                    textDecoration: "none",
                    lineHeight: 1.4,
                  }}
                >
                  {n.title}
                  {n.author ? (
                    <span
                      style={{
                        color: "var(--bb-gray)",
                        fontFamily: "var(--bb-font, monospace)",
                        fontSize: "0.62rem",
                        marginLeft: "0.5rem",
                      }}
                    >
                      · {n.author}
                    </span>
                  ) : null}
                </a>
                <span style={DATE_STYLE}>
                  {n.published_at
                    ? new Date(n.published_at).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                      })
                    : "—"}
                </span>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}
