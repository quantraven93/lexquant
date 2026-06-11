"use client";

import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";

interface Briefing {
  id: string;
  briefing_date: string;
  body: string;
  provider: string;
  model: string;
  input_signals: Record<string, number> | null;
  generated_at: string;
}

export default function BriefingPage() {
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/briefing")
      .then(async (r) => {
        if (r.status === 401) {
          setError("Sign in to view your morning briefing.");
          return null;
        }
        return r.json();
      })
      .then((data) => {
        setBriefing(data?.briefing ?? null);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load briefing.");
        setLoading(false);
      });
  }, []);

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <DashboardShell>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "1px",
          background: "var(--bb-border)",
          minHeight: "100%",
        }}
      >
        <div className="bb-panel-header">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span className="bb-panel-title">MORNING BRIEFING</span>
            <span className="live-dot" />
          </div>
          <span
            style={{
              fontSize: "0.6rem",
              color: "var(--bb-gray)",
              letterSpacing: "0.05em",
            }}
          >
            {today}
          </span>
        </div>

        <div style={{ background: "var(--bb-panel)", padding: "1.25rem" }}>
          {loading ? (
            <div
              style={{
                color: "var(--bb-amber)",
                fontSize: "0.75rem",
                letterSpacing: "0.1em",
                fontWeight: 600,
              }}
            >
              [LOADING BRIEFING...]
            </div>
          ) : error ? (
            <div
              style={{
                color: "var(--bb-gray)",
                fontSize: "0.78rem",
                letterSpacing: "0.06em",
              }}
            >
              {error}
            </div>
          ) : !briefing ? (
            <div
              style={{
                color: "var(--bb-gray)",
                fontSize: "0.78rem",
                letterSpacing: "0.06em",
              }}
            >
              No briefing yet · the morning cron generates one daily at 06:30
              IST.
            </div>
          ) : (
            <>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "1.5rem",
                  marginBottom: "1rem",
                  fontFamily: "var(--bb-font, monospace)",
                  fontSize: "0.6rem",
                  color: "var(--bb-gray)",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                <span>
                  <strong style={{ color: "var(--bb-amber-dim)" }}>
                    DATE:
                  </strong>{" "}
                  {briefing.briefing_date}
                </span>
                <span>
                  <strong style={{ color: "var(--bb-amber-dim)" }}>
                    MODEL:
                  </strong>{" "}
                  {briefing.provider} / {briefing.model}
                </span>
                {briefing.input_signals ? (
                  <>
                    <span>
                      <strong style={{ color: "var(--bb-amber-dim)" }}>
                        TRACKED:
                      </strong>{" "}
                      {briefing.input_signals.tracked_cases ?? 0}
                    </span>
                    <span>
                      <strong style={{ color: "var(--bb-amber-dim)" }}>
                        HEARINGS:
                      </strong>{" "}
                      {briefing.input_signals.upcoming_hearings ?? 0}
                    </span>
                    <span>
                      <strong style={{ color: "var(--bb-amber-dim)" }}>
                        JUDGMENTS:
                      </strong>{" "}
                      {briefing.input_signals.fresh_judgments ?? 0}
                    </span>
                    <span>
                      <strong style={{ color: "var(--bb-amber-dim)" }}>
                        NEWS:
                      </strong>{" "}
                      {briefing.input_signals.fresh_news ?? 0}
                    </span>
                  </>
                ) : null}
              </div>
              <div
                style={{
                  whiteSpace: "pre-wrap",
                  color: "var(--bb-white)",
                  fontFamily: "var(--bb-font-serif, Georgia, serif)",
                  fontSize: "0.85rem",
                  lineHeight: 1.55,
                }}
              >
                {briefing.body}
              </div>
            </>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
