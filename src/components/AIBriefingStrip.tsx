"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface BriefingPayload {
  briefing?: {
    body: string;
    briefing_date: string;
    provider: string;
    model: string;
  } | null;
  error?: string;
}

/**
 * Compact AI briefing strip rendered full-width under the dashboard
 * grid. Pulls the latest /api/briefing row for the signed-in user.
 * If the morning cron has not generated one yet, shows a CTA.
 */
export function AIBriefingStrip() {
  const [data, setData] = useState<BriefingPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/briefing")
      .then((r) => r.json())
      .then((d: BriefingPayload) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => {
        setData({ error: "fetch_failed" });
        setLoading(false);
      });
  }, []);

  return (
    <div className="bb-panel">
      <div className="bb-panel-header">
        <span className="bb-panel-title">AI Morning Briefing</span>
        <Link
          href="/briefing"
          style={{
            fontFamily: "var(--bb-font, monospace)",
            fontSize: "0.58rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--bb-amber)",
            textDecoration: "none",
          }}
        >
          Full briefing →
        </Link>
      </div>
      <div style={{ padding: "0.65rem 1rem" }}>
        {loading ? (
          <div
            style={{
              color: "var(--bb-amber)",
              fontFamily: "var(--bb-font, monospace)",
              fontSize: "0.66rem",
              letterSpacing: "0.08em",
            }}
          >
            [LOADING BRIEFING...] ▊
          </div>
        ) : data?.briefing ? (
          <div
            style={{
              color: "var(--bb-white)",
              fontFamily: "var(--bb-font-serif, Georgia, serif)",
              fontSize: "0.8rem",
              lineHeight: 1.5,
              maxHeight: "3.6em",
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
            }}
          >
            {data.briefing.body}
          </div>
        ) : (
          <div
            style={{
              color: "var(--bb-gray)",
              fontFamily: "var(--bb-font, monospace)",
              fontSize: "0.66rem",
              letterSpacing: "0.06em",
            }}
          >
            No briefing yet · the morning cron runs daily at 06:30 IST.
          </div>
        )}
      </div>
    </div>
  );
}
