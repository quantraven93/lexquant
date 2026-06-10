"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
  cited_by_tids: number[] | null;
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

const COURT_BDG_CLASS: Record<string, string> = {
  supremecourt: "bdg sc",
  scorders: "bdg sc",
  bombay: "bdg hc",
  delhi: "bdg hc",
  chennai: "bdg hc",
  bangalore: "bdg hc",
  allahabad: "bdg hc",
  kolkata_app: "bdg hc",
  madhyapradesh: "bdg hc",
  punjab: "bdg hc",
  jodhpur: "bdg hc",
};

const COURT_LABEL: Record<string, string> = {
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

function shortDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
  });
}

function pauseTime(): string {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm} IST`;
}

function EmptyState({ message }: { message: string }) {
  return <div className="bb-digest-empty">{message}</div>;
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
      className={`bb-digest-tab ${active ? "is-active" : ""}`}
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
  const [fetchedAt, setFetchedAt] = useState<string>(pauseTime());

  useEffect(() => {
    fetch(`/api/judgments?limit=${limit}`)
      .then((r) => r.json())
      .then((data) => {
        setJudgments(data.judgments || []);
        setLoadingJ(false);
        setFetchedAt(pauseTime());
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
    <div
      className="bb-panel"
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
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
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.3rem",
          }}
        >
          <span className="live-dot" />
          <span className="bb-panel-tag">LIVE</span>
        </span>
      </div>

      <div style={{ flex: 1, overflow: "auto" }}>
        {tab === "judgments" &&
          (loadingJ ? (
            <EmptyState message="[LOADING JUDGMENTS...]" />
          ) : judgments.length === 0 ? (
            <EmptyState message="NO JUDGMENTS · run cron to populate" />
          ) : (
            <ul className="bb-digest-list">
              {judgments.map((j) => {
                const citedBy = j.cited_by_tids?.length || 0;
                return (
                  <li key={j.id} className="bb-digest-row">
                    <span className="bb-digest-time">
                      {shortDate(j.publish_date)}
                    </span>
                    <span className={COURT_BDG_CLASS[j.court_code] || "bdg"}>
                      {COURT_LABEL[j.court_code] ||
                        j.court_code.slice(0, 4).toUpperCase()}
                    </span>
                    <Link
                      href={`/research/${j.ik_tid}`}
                      className="bb-digest-title"
                      title={j.title}
                    >
                      {j.title}
                      {j.citation ? (
                        <span className="bb-digest-meta">· {j.citation}</span>
                      ) : null}
                    </Link>
                    {citedBy > 0 ? (
                      <span className="bb-digest-cited" title="Cited by">
                        +{citedBy}
                      </span>
                    ) : (
                      <span className="bb-digest-cited bb-digest-cited-dim">
                        —
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          ))}

        {tab === "news" &&
          (loadingN ? (
            <EmptyState message="[LOADING NEWS...]" />
          ) : news.length === 0 ? (
            <EmptyState message="NO NEWS · run cron to populate" />
          ) : (
            <ul className="bb-digest-list">
              {news.map((n) => (
                <li key={n.id} className="bb-digest-row bb-digest-row-news">
                  <span className="bb-digest-time">
                    {shortDate(n.published_at)}
                  </span>
                  <span className="bdg">
                    {SOURCE_BADGES[n.source] ||
                      n.source.slice(0, 4).toUpperCase()}
                  </span>
                  <a
                    href={n.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bb-digest-title"
                    title={n.title}
                  >
                    {n.title}
                    {n.author ? (
                      <span className="bb-digest-meta">· {n.author}</span>
                    ) : null}
                  </a>
                </li>
              ))}
            </ul>
          ))}
      </div>

      <div className="bb-digest-footer">
        fetched at {fetchedAt} · judgments &amp; news ingest daily at 06:30 IST
      </div>
    </div>
  );
}
