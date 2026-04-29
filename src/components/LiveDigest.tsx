"use client";

import { useEffect, useState } from "react";

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

export function LiveDigest({ limit = 10 }: { limit?: number }) {
  const [judgments, setJudgments] = useState<Judgment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/judgments?limit=${limit}`)
      .then((r) => r.json())
      .then((data) => {
        setJudgments(data.judgments || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [limit]);

  return (
    <div className="bb-panel">
      <div className="bb-panel-header">
        <span className="bb-panel-title">Live Digest · Indian Kanoon</span>
        <span className="bb-panel-tag">Live</span>
      </div>
      {loading ? (
        <div
          style={{
            padding: "1.5rem",
            textAlign: "center",
            color: "var(--bb-gray)",
            fontSize: "0.7rem",
            letterSpacing: "0.08em",
          }}
        >
          [LOADING JUDGMENTS...]
        </div>
      ) : judgments.length === 0 ? (
        <div
          style={{
            padding: "1.5rem",
            textAlign: "center",
            color: "var(--bb-gray)",
            fontSize: "0.7rem",
            letterSpacing: "0.08em",
          }}
        >
          NO JUDGMENTS · run cron to populate
        </div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {judgments.map((j) => (
            <li
              key={j.id}
              style={{
                display: "grid",
                gridTemplateColumns: "60px 1fr auto",
                gap: "0.5rem",
                alignItems: "baseline",
                padding: "0.4rem 0.75rem",
                borderBottom: "1px solid rgba(0,0,0,0.05)",
                fontSize: "0.72rem",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--bb-font, monospace)",
                  fontSize: "0.6rem",
                  letterSpacing: "0.06em",
                  color: "var(--bb-amber-dim)",
                  fontWeight: 600,
                }}
              >
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
              <span
                style={{
                  fontFamily: "var(--bb-font, monospace)",
                  fontSize: "0.6rem",
                  color: "var(--bb-gray)",
                  whiteSpace: "nowrap",
                }}
              >
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
      )}
    </div>
  );
}
