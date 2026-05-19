"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/DashboardShell";
import type {
  JudgeDossier,
  JudgeDocSummary,
  CourtBreakdown,
  YearBreakdown,
} from "@/lib/ik/judge";

const STAT_STYLE: React.CSSProperties = {
  fontFamily: "var(--bb-font, monospace)",
  fontSize: "0.7rem",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--bb-gray)",
};

const STAT_VAL_STYLE: React.CSSProperties = {
  fontFamily: "var(--bb-font, monospace)",
  fontSize: "1.4rem",
  fontWeight: 700,
  color: "var(--bb-amber-dim)",
  lineHeight: 1,
};

function DossierHeader({ name }: { name: string }) {
  return (
    <div
      className="bb-panel"
      style={{ marginBottom: "1px", padding: "1rem 1.25rem" }}
    >
      <div
        style={{
          fontFamily: "var(--bb-font, monospace)",
          fontSize: "0.6rem",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--bb-amber-dim)",
          marginBottom: "0.35rem",
        }}
      >
        Judge Dossier
      </div>
      <h1
        style={{
          fontFamily: "var(--bb-font-serif, Georgia, serif)",
          fontSize: "1.45rem",
          lineHeight: 1.3,
          margin: 0,
          color: "var(--bb-white)",
        }}
      >
        {name}
      </h1>
    </div>
  );
}

function DossierStats({ dossier }: { dossier: JudgeDossier }) {
  return (
    <div
      className="bb-panel"
      style={{
        marginBottom: "1px",
        padding: "0.75rem 1.25rem",
        display: "flex",
        gap: "2.5rem",
        flexWrap: "wrap",
      }}
    >
      <div>
        <div style={STAT_VAL_STYLE}>{dossier.totalFound}</div>
        <div style={STAT_STYLE}>Authored (IK)</div>
      </div>
      <div>
        <div style={STAT_VAL_STYLE}>{dossier.returned}</div>
        <div style={STAT_STYLE}>Sampled</div>
      </div>
      <div>
        <div style={STAT_VAL_STYLE}>{dossier.totalCitations}</div>
        <div style={STAT_STYLE}>Citation Impact</div>
      </div>
      <div>
        <div style={STAT_VAL_STYLE}>{dossier.courts.length}</div>
        <div style={STAT_STYLE}>Courts</div>
      </div>
    </div>
  );
}

function BreakdownPanel({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label: string; count: number }>;
}) {
  if (!rows.length) return null;
  const max = rows[0]?.count || 1;
  return (
    <div className="bb-panel" style={{ marginBottom: "1px" }}>
      <div className="bb-panel-header">
        <span className="bb-panel-title">{title}</span>
        <span className="bb-panel-tag">{rows.length}</span>
      </div>
      <div style={{ padding: "0.5rem 1rem" }}>
        {rows.map((r) => (
          <div
            key={r.label}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: "0.75rem",
              alignItems: "center",
              padding: "0.25rem 0",
              fontSize: "0.72rem",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "180px 1fr",
                gap: "0.5rem",
                alignItems: "center",
              }}
            >
              <span
                style={{
                  color: "var(--bb-white)",
                  fontFamily: "var(--bb-font, monospace)",
                  fontSize: "0.66rem",
                  letterSpacing: "0.04em",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                title={r.label}
              >
                {r.label}
              </span>
              <div
                style={{
                  background: "rgba(255,255,255,0.05)",
                  height: "6px",
                  borderRadius: "1px",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    background: "var(--bb-amber-dim)",
                    height: "100%",
                    width: `${(r.count / max) * 100}%`,
                  }}
                />
              </div>
            </div>
            <span
              style={{
                fontFamily: "var(--bb-font, monospace)",
                color: "var(--bb-amber-dim)",
                fontWeight: 600,
                fontSize: "0.66rem",
              }}
            >
              {r.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function JudgmentRow({ j }: { j: JudgeDocSummary }) {
  return (
    <li
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr auto auto",
        gap: "0.75rem",
        alignItems: "baseline",
        padding: "0.5rem 1rem",
        borderBottom: "1px solid rgba(0,0,0,0.05)",
        fontSize: "0.74rem",
      }}
    >
      <span
        style={{
          fontFamily: "var(--bb-font, monospace)",
          fontSize: "0.58rem",
          letterSpacing: "0.06em",
          color: "var(--bb-amber-dim)",
          fontWeight: 600,
          whiteSpace: "nowrap",
        }}
      >
        {j.publishdate
          ? new Date(j.publishdate).toLocaleDateString("en-IN", {
              year: "numeric",
              month: "short",
              day: "2-digit",
            })
          : "—"}
      </span>
      <div style={{ minWidth: 0 }}>
        <span
          style={{
            color: "var(--bb-white)",
            fontFamily: "var(--bb-font-serif, Georgia, serif)",
            lineHeight: 1.4,
          }}
        >
          {j.title}
        </span>
        {j.docsource || j.citation ? (
          <div
            style={{
              color: "var(--bb-gray)",
              fontFamily: "var(--bb-font, monospace)",
              fontSize: "0.6rem",
              marginTop: "0.15rem",
            }}
          >
            {[j.docsource, j.citation].filter(Boolean).join(" · ")}
          </div>
        ) : null}
      </div>
      <span
        style={{
          fontFamily: "var(--bb-font, monospace)",
          fontSize: "0.58rem",
          color: "var(--bb-gray)",
          letterSpacing: "0.06em",
          whiteSpace: "nowrap",
        }}
        title="Times cited by later judgments"
      >
        cited {j.numcitedby}×
      </span>
      <Link
        href={`/research/${j.tid}`}
        style={{
          fontFamily: "var(--bb-font, monospace)",
          fontSize: "0.58rem",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--bb-amber)",
          textDecoration: "none",
          padding: "0.15rem 0.45rem",
          border: "1px solid var(--bb-amber-dim)",
          borderRadius: "2px",
          whiteSpace: "nowrap",
        }}
      >
        Research
      </Link>
    </li>
  );
}

export default function JudgePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const judgeName = decodeURIComponent(slug);
  const [dossier, setDossier] = useState<JudgeDossier | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/judges/${encodeURIComponent(slug)}`)
      .then(async (r) => {
        const data = await r.json();
        if (cancelled) return;
        if (!r.ok) {
          setError(data?.error || `Failed (${r.status})`);
          setLoading(false);
          return;
        }
        setDossier(data.dossier);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Network error");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

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
        <div
          className="bb-panel-header"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Link
            href="/dashboard"
            style={{
              fontFamily: "var(--bb-font, monospace)",
              fontSize: "0.6rem",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--bb-gray)",
              textDecoration: "none",
            }}
          >
            ← Dashboard
          </Link>
          <span className="bb-panel-tag">Judges</span>
        </div>

        {loading ? (
          <div
            style={{
              padding: "3rem",
              textAlign: "center",
              color: "var(--bb-amber)",
              fontFamily: "var(--bb-font, monospace)",
              fontSize: "0.75rem",
              letterSpacing: "0.1em",
              background: "var(--bb-panel)",
            }}
          >
            [LOADING DOSSIER FOR {judgeName.toUpperCase()}...]
          </div>
        ) : error ? (
          <div
            style={{
              padding: "2rem",
              color: "var(--bb-red)",
              fontFamily: "var(--bb-font, monospace)",
              fontSize: "0.75rem",
              background: "var(--bb-panel)",
            }}
          >
            ERROR: {error}
          </div>
        ) : dossier ? (
          <>
            <DossierHeader name={dossier.name} />
            <DossierStats dossier={dossier} />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "1px",
                background: "var(--bb-border)",
              }}
            >
              <BreakdownPanel
                title="By Court"
                rows={dossier.courts.map((c: CourtBreakdown) => ({
                  label: c.court,
                  count: c.count,
                }))}
              />
              <BreakdownPanel
                title="By Year"
                rows={dossier.years.map((y: YearBreakdown) => ({
                  label: String(y.year),
                  count: y.count,
                }))}
              />
            </div>
            {dossier.topCited.length > 0 &&
            dossier.topCited[0].numcitedby > 0 ? (
              <div className="bb-panel" style={{ marginBottom: "1px" }}>
                <div className="bb-panel-header">
                  <span className="bb-panel-title">Top Cited Rulings</span>
                  <span className="bb-panel-tag">
                    {dossier.topCited.length}
                  </span>
                </div>
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {dossier.topCited.map((j) => (
                    <JudgmentRow key={`top-${j.tid}`} j={j} />
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="bb-panel" style={{ marginBottom: "1px" }}>
              <div className="bb-panel-header">
                <span className="bb-panel-title">All Sampled Rulings</span>
                <span className="bb-panel-tag">{dossier.judgments.length}</span>
              </div>
              {dossier.judgments.length === 0 ? (
                <div
                  style={{
                    padding: "1.5rem",
                    textAlign: "center",
                    color: "var(--bb-gray)",
                    fontSize: "0.7rem",
                    letterSpacing: "0.08em",
                  }}
                >
                  No authored judgments matched on Indian Kanoon for this name.
                </div>
              ) : (
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {dossier.judgments.map((j) => (
                    <JudgmentRow key={j.tid} j={j} />
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : null}
      </div>
    </DashboardShell>
  );
}
