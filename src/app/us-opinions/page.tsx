"use client";

import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";

interface USOpinion {
  id: string;
  cl_id: number;
  cluster_id: number | null;
  court_id: string;
  court_name: string | null;
  case_name: string;
  citations: string[] | null;
  date_filed: string | null;
  judge: string | null;
  snippet: string | null;
  status: string | null;
  source_url: string;
  ingested_at: string;
}

const COURT_BADGE: Record<string, string> = {
  scotus: "SCOTUS",
  ca1: "1CIR",
  ca2: "2CIR",
  ca3: "3CIR",
  ca4: "4CIR",
  ca5: "5CIR",
  ca6: "6CIR",
  ca7: "7CIR",
  ca8: "8CIR",
  ca9: "9CIR",
  ca10: "10CIR",
  ca11: "11CIR",
  cadc: "DC",
  cafc: "FED",
};

const ROW_STYLE: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "80px 1fr auto",
  gap: "0.75rem",
  alignItems: "baseline",
  padding: "0.55rem 0.85rem",
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

export default function USOpinionsPage() {
  const [opinions, setOpinions] = useState<USOpinion[]>([]);
  const [loading, setLoading] = useState(true);
  const [court, setCourt] = useState<string>("");

  useEffect(() => {
    const qs = court ? `?limit=40&court=${court}` : `?limit=40`;
    setLoading(true);
    fetch(`/api/us-opinions${qs}`)
      .then((r) => r.json())
      .then((data) => {
        setOpinions(data.opinions || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [court]);

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
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
            <span className="bb-panel-title">US OPINIONS · COURTLISTENER</span>
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

        <div
          style={{
            background: "var(--bb-panel)",
            padding: "0.5rem 0.85rem",
            display: "flex",
            gap: "0.4rem",
            flexWrap: "wrap",
          }}
        >
          <FilterPill
            label="ALL"
            active={court === ""}
            onClick={() => setCourt("")}
          />
          {Object.entries(COURT_BADGE).map(([id, label]) => (
            <FilterPill
              key={id}
              label={label}
              active={court === id}
              onClick={() => setCourt(id)}
            />
          ))}
        </div>

        <div style={{ background: "var(--bb-panel)" }}>
          {loading ? (
            <EmptyState message="[LOADING OPINIONS...]" />
          ) : opinions.length === 0 ? (
            <EmptyState message="NO OPINIONS · run cron to populate" />
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {opinions.map((o) => (
                <li key={o.id} style={ROW_STYLE}>
                  <span style={BADGE_STYLE}>
                    {COURT_BADGE[o.court_id] || o.court_id.toUpperCase()}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <a
                      href={o.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: "var(--bb-white)",
                        fontFamily: "var(--bb-font-serif, Georgia, serif)",
                        textDecoration: "none",
                        lineHeight: 1.4,
                        display: "block",
                      }}
                    >
                      {o.case_name}
                      {o.citations && o.citations.length > 0 ? (
                        <span
                          style={{
                            color: "var(--bb-gray)",
                            fontFamily: "var(--bb-font, monospace)",
                            fontSize: "0.62rem",
                            marginLeft: "0.5rem",
                          }}
                        >
                          · {o.citations.join("; ")}
                        </span>
                      ) : null}
                    </a>
                    {o.snippet ? (
                      <div
                        style={{
                          color: "var(--bb-gray)",
                          fontSize: "0.66rem",
                          lineHeight: 1.45,
                          marginTop: "0.2rem",
                        }}
                      >
                        {o.snippet}
                      </div>
                    ) : null}
                    {o.judge ? (
                      <div
                        style={{
                          color: "var(--bb-amber-dim)",
                          fontFamily: "var(--bb-font, monospace)",
                          fontSize: "0.58rem",
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                          marginTop: "0.2rem",
                        }}
                      >
                        {o.judge}
                      </div>
                    ) : null}
                  </div>
                  <span style={DATE_STYLE}>
                    {o.date_filed
                      ? new Date(o.date_filed).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "2-digit",
                        })
                      : "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}

function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: active ? "var(--bb-amber-dim)" : "transparent",
        color: active ? "var(--bb-bg)" : "var(--bb-gray)",
        border: "1px solid var(--bb-amber-dim)",
        fontFamily: "var(--bb-font, monospace)",
        fontSize: "0.58rem",
        letterSpacing: "0.08em",
        padding: "0.2rem 0.5rem",
        cursor: "pointer",
        borderRadius: "2px",
      }}
    >
      {label}
    </button>
  );
}

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
