"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/DashboardShell";
import {
  IK_STRUCTURE_LABELS,
  IK_STRUCTURE_RENDER_ORDER,
  type ParsedResearchView,
} from "@/lib/ik/types";

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

function SectionPanel({
  title,
  paragraphs,
}: {
  title: string;
  paragraphs: string[];
}) {
  if (!paragraphs.length) return null;
  return (
    <div className="bb-panel" style={{ marginBottom: "1px" }}>
      <div className="bb-panel-header">
        <span className="bb-panel-title">{title}</span>
        <span className="bb-panel-tag">{paragraphs.length}</span>
      </div>
      <div
        style={{
          padding: "0.75rem 1rem",
          fontFamily: "var(--bb-font-serif, Georgia, serif)",
          fontSize: "0.85rem",
          lineHeight: 1.55,
          color: "var(--bb-white)",
        }}
      >
        {paragraphs.map((p, i) => (
          <p
            key={i}
            style={{
              marginBottom: i === paragraphs.length - 1 ? 0 : "0.65rem",
            }}
          >
            {p}
          </p>
        ))}
      </div>
    </div>
  );
}

function ResearchHeader({ view }: { view: ParsedResearchView }) {
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
        Research View · TID {view.tid}
      </div>
      <h1
        style={{
          fontFamily: "var(--bb-font-serif, Georgia, serif)",
          fontSize: "1.35rem",
          lineHeight: 1.3,
          margin: 0,
          marginBottom: "0.5rem",
          color: "var(--bb-white)",
        }}
      >
        {view.title}
      </h1>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.6rem 1.2rem",
          fontSize: "0.72rem",
          color: "var(--bb-gray)",
          fontFamily: "var(--bb-font-sans)",
        }}
      >
        {view.court ? <span>Court: {view.court}</span> : null}
        {view.publishdate ? (
          <span>
            Date:{" "}
            {new Date(view.publishdate).toLocaleDateString("en-IN", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </span>
        ) : null}
        {view.author ? <span>Author: {view.author}</span> : null}
        {view.bench.length > 0 ? (
          <span>Bench: {view.bench.join(", ")}</span>
        ) : null}
      </div>
    </div>
  );
}

function ResearchStats({ view }: { view: ParsedResearchView }) {
  return (
    <div
      className="bb-panel"
      style={{
        marginBottom: "1px",
        padding: "0.75rem 1.25rem",
        display: "flex",
        gap: "2.5rem",
      }}
    >
      <div>
        <div style={STAT_VAL_STYLE}>{view.numcites}</div>
        <div style={STAT_STYLE}>Cites</div>
      </div>
      <div>
        <div style={STAT_VAL_STYLE}>{view.numcitedby}</div>
        <div style={STAT_STYLE}>Cited By</div>
      </div>
      <div>
        <div style={STAT_VAL_STYLE}>{(view.docLength / 1024).toFixed(1)}k</div>
        <div style={STAT_STYLE}>Doc Size</div>
      </div>
      <div style={{ marginLeft: "auto", display: "flex", gap: "0.5rem" }}>
        <a
          href={view.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            background: "var(--bb-amber)",
            color: "var(--bb-bg)",
            padding: "0.4rem 0.8rem",
            fontFamily: "var(--bb-font, monospace)",
            fontSize: "0.62rem",
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            textDecoration: "none",
            border: "1px solid var(--bb-amber)",
          }}
        >
          Open on IK
        </a>
      </div>
    </div>
  );
}

function FullTextPanel({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bb-panel" style={{ marginBottom: "1px" }}>
      <div className="bb-panel-header">
        <span className="bb-panel-title">Full Text</span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{
            background: "transparent",
            border: "1px solid var(--bb-border)",
            padding: "0.15rem 0.6rem",
            fontFamily: "var(--bb-font, monospace)",
            fontSize: "0.58rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--bb-gray)",
            cursor: "pointer",
          }}
        >
          {open ? "Collapse" : "Expand"}
        </button>
      </div>
      {open ? (
        <div
          style={{
            padding: "0.75rem 1rem",
            fontFamily: "var(--bb-font-serif, Georgia, serif)",
            fontSize: "0.8rem",
            lineHeight: 1.6,
            color: "var(--bb-white)",
            maxHeight: "60vh",
            overflowY: "auto",
            whiteSpace: "pre-wrap",
          }}
        >
          {text}
        </div>
      ) : null}
    </div>
  );
}

export default function ResearchPage({
  params,
}: {
  params: Promise<{ tid: string }>;
}) {
  const { tid: tidParam } = use(params);
  const [view, setView] = useState<ParsedResearchView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/research/${tidParam}`)
      .then(async (r) => {
        const data = await r.json();
        if (cancelled) return;
        if (!r.ok) {
          setError(data?.error || `Failed (${r.status})`);
          setLoading(false);
          return;
        }
        setView(data.view);
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
  }, [tidParam]);

  const hasAnyStructured =
    view &&
    IK_STRUCTURE_RENDER_ORDER.some(
      (t) => t !== "Other" && view.sections[t].length > 0,
    );

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
          <span className="bb-panel-tag">Research</span>
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
            [FETCHING JUDGMENT FROM INDIAN KANOON...]
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
        ) : view ? (
          <>
            <ResearchHeader view={view} />
            <ResearchStats view={view} />
            {hasAnyStructured ? (
              IK_STRUCTURE_RENDER_ORDER.map((t) =>
                view.sections[t].length > 0 ? (
                  <SectionPanel
                    key={t}
                    title={IK_STRUCTURE_LABELS[t]}
                    paragraphs={view.sections[t]}
                  />
                ) : null,
              )
            ) : (
              <div
                style={{
                  padding: "1rem 1.25rem",
                  background: "var(--bb-panel)",
                  color: "var(--bb-gray)",
                  fontSize: "0.75rem",
                  fontFamily: "var(--bb-font-sans)",
                }}
              >
                Indian Kanoon has not classified paragraphs for this judgment.
                The full text is available below.
              </div>
            )}
            <FullTextPanel text={view.fullText} />
          </>
        ) : null}
      </div>
    </DashboardShell>
  );
}
