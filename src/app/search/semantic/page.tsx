"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/DashboardShell";
import {
  IK_STRUCTURE_LABELS,
  IK_STRUCTURE_RENDER_ORDER,
  type IKStructureType,
} from "@/lib/ik/types";

interface SemanticHit {
  ikTid: number;
  title: string;
  court: string;
  courtCode: string;
  citation: string | null;
  publishDate: string | null;
  sourceUrl: string;
  bestStructureType: IKStructureType | null;
  snippet: string;
  distance: number;
  matchedChunks: number;
}

interface SemanticResponse {
  query: string;
  limit: number;
  structureFilter: string[] | null;
  courtFilter: string[] | null;
  chunksScanned: number;
  truncated: boolean;
  droppedNewJudgments: number;
  results: SemanticHit[];
}

const COURT_FILTERS: { code: string; label: string }[] = [
  { code: "supremecourt", label: "SC" },
  { code: "bombay", label: "Bombay HC" },
  { code: "delhi", label: "Delhi HC" },
  { code: "chennai", label: "Madras HC" },
  { code: "bangalore", label: "Karnataka HC" },
  { code: "allahabad", label: "Allahabad HC" },
  { code: "madhyapradesh", label: "MP HC" },
];

function relevancePct(distance: number): number {
  // pgvector `<=>` is cosine DISTANCE with range [0, 2]:
  //   0 = identical, 1 = orthogonal, 2 = antipodal.
  // Map to a relevance percentage where identical = 100% and orthogonal = 50%.
  return Math.max(0, Math.min(100, Math.round(((2 - distance) / 2) * 100)));
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function SemanticSearchPage() {
  const [q, setQ] = useState("");
  const [structureFilters, setStructureFilters] = useState<
    Set<IKStructureType>
  >(new Set());
  const [courtFilters, setCourtFilters] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<SemanticHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  // Tracks the currently in-flight request so a newer submission can abort
  // an older one — protects against out-of-order responses overwriting the
  // latest query's results.
  const inFlightRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      inFlightRef.current?.abort();
    };
  }, []);

  function toggleStructure(t: IKStructureType) {
    setStructureFilters((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  function toggleCourt(code: string) {
    setCourtFilters((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    const query = q.trim();
    if (query.length < 3) return;

    // Cancel any prior in-flight request so out-of-order responses can't
    // overwrite the newest query.
    inFlightRef.current?.abort();
    const controller = new AbortController();
    inFlightRef.current = controller;

    setLoading(true);
    setError(null);
    setSearched(true);

    const params = new URLSearchParams({ q: query, limit: "15" });
    if (structureFilters.size)
      params.set("structure", Array.from(structureFilters).join(","));
    if (courtFilters.size)
      params.set("court", Array.from(courtFilters).join(","));

    try {
      const res = await fetch(`/api/search/semantic?${params}`, {
        signal: controller.signal,
      });
      const data = (await res.json()) as SemanticResponse | { error?: string };
      if (controller.signal.aborted) return;
      if (!res.ok) {
        setError(("error" in data && data.error) || `Failed (${res.status})`);
        setResults([]);
      } else {
        setResults(("results" in data && data.results) || []);
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : "Network error");
      setResults([]);
    } finally {
      if (inFlightRef.current === controller) {
        inFlightRef.current = null;
        setLoading(false);
      }
    }
  }

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
          <span className="bb-panel-title">SEMANTIC SEARCH</span>
          <span
            style={{
              fontSize: "0.58rem",
              color: "var(--bb-gray)",
              letterSpacing: "0.08em",
            }}
          >
            voyage-law-2 · cosine kNN over judgment paragraphs
          </span>
        </div>

        <div className="bb-panel">
          <form
            onSubmit={runSearch}
            style={{
              padding: "1rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
            }}
          >
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Describe the legal proposition or fact-pattern you're searching for…"
                style={{ flex: 1 }}
                autoFocus
              />
              <button
                type="submit"
                disabled={loading || q.trim().length < 3}
                className="bb-btn bb-btn-primary"
                style={{
                  padding: "0 1.2rem",
                  opacity: loading || q.trim().length < 3 ? 0.5 : 1,
                  cursor:
                    loading || q.trim().length < 3 ? "not-allowed" : "pointer",
                }}
              >
                {loading ? "[SEARCHING...]" : "[SEARCH]"}
              </button>
            </div>

            <div>
              <div
                style={{
                  fontSize: "0.58rem",
                  color: "var(--bb-gray)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginBottom: "0.3rem",
                  fontWeight: 600,
                }}
              >
                Section filter
              </div>
              <div
                style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}
              >
                {IK_STRUCTURE_RENDER_ORDER.filter((t) => t !== "Other").map(
                  (t) => {
                    const active = structureFilters.has(t);
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => toggleStructure(t)}
                        style={{
                          fontFamily: "var(--bb-font, monospace)",
                          fontSize: "0.58rem",
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                          padding: "0.2rem 0.55rem",
                          border: `1px solid ${
                            active ? "var(--bb-amber)" : "var(--bb-border)"
                          }`,
                          background: active
                            ? "var(--bb-amber)"
                            : "transparent",
                          color: active ? "var(--bb-bg)" : "var(--bb-gray)",
                          cursor: "pointer",
                        }}
                      >
                        {IK_STRUCTURE_LABELS[t]}
                      </button>
                    );
                  },
                )}
              </div>
            </div>

            <div>
              <div
                style={{
                  fontSize: "0.58rem",
                  color: "var(--bb-gray)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginBottom: "0.3rem",
                  fontWeight: 600,
                }}
              >
                Court filter
              </div>
              <div
                style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}
              >
                {COURT_FILTERS.map((c) => {
                  const active = courtFilters.has(c.code);
                  return (
                    <button
                      key={c.code}
                      type="button"
                      onClick={() => toggleCourt(c.code)}
                      style={{
                        fontFamily: "var(--bb-font, monospace)",
                        fontSize: "0.58rem",
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        padding: "0.2rem 0.55rem",
                        border: `1px solid ${
                          active ? "var(--bb-amber)" : "var(--bb-border)"
                        }`,
                        background: active ? "var(--bb-amber)" : "transparent",
                        color: active ? "var(--bb-bg)" : "var(--bb-gray)",
                        cursor: "pointer",
                      }}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </form>
        </div>

        {loading && (
          <div className="bb-panel">
            <div
              style={{
                padding: "2rem",
                textAlign: "center",
                color: "var(--bb-amber)",
                fontFamily: "var(--bb-font, monospace)",
                fontSize: "0.72rem",
                letterSpacing: "0.1em",
              }}
            >
              [EMBEDDING QUERY · MATCHING CHUNKS…]
            </div>
          </div>
        )}

        {error && !loading && (
          <div className="bb-panel">
            <div
              style={{
                padding: "1.5rem",
                color: "var(--bb-red)",
                fontFamily: "var(--bb-font, monospace)",
                fontSize: "0.72rem",
              }}
            >
              ERROR: {error}
            </div>
          </div>
        )}

        {searched && !loading && !error && results.length === 0 && (
          <div className="bb-panel">
            <div
              style={{
                padding: "2rem",
                textAlign: "center",
                color: "var(--bb-gray)",
                fontSize: "0.78rem",
              }}
            >
              No matches. Try broader filters or different phrasing.
            </div>
          </div>
        )}

        {results.map((hit) => (
          <div
            className="bb-panel"
            key={hit.ikTid}
            style={{ padding: "0.9rem 1rem" }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "1rem",
                marginBottom: "0.45rem",
              }}
            >
              <Link
                href={`/research/${hit.ikTid}`}
                style={{
                  color: "var(--bb-white)",
                  fontFamily: "var(--bb-font-serif, Georgia, serif)",
                  fontSize: "0.95rem",
                  textDecoration: "none",
                  lineHeight: 1.3,
                }}
              >
                {hit.title}
              </Link>
              <div
                style={{
                  fontFamily: "var(--bb-font, monospace)",
                  fontSize: "0.62rem",
                  color: "var(--bb-amber)",
                  whiteSpace: "nowrap",
                  letterSpacing: "0.06em",
                }}
              >
                {relevancePct(hit.distance)}% match
                {hit.matchedChunks > 1 ? ` · ${hit.matchedChunks} hits` : ""}
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: "1rem",
                fontFamily: "var(--bb-font, monospace)",
                fontSize: "0.6rem",
                color: "var(--bb-gray)",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                marginBottom: "0.55rem",
              }}
            >
              <span>{hit.court}</span>
              <span>{formatDate(hit.publishDate)}</span>
              {hit.citation && <span>{hit.citation}</span>}
              {hit.bestStructureType && (
                <span style={{ color: "var(--bb-amber-dim)" }}>
                  ·{" "}
                  {IK_STRUCTURE_LABELS[
                    hit.bestStructureType as IKStructureType
                  ] ?? hit.bestStructureType}
                </span>
              )}
            </div>

            <div
              style={{
                fontFamily: "var(--bb-font-serif, Georgia, serif)",
                fontSize: "0.82rem",
                lineHeight: 1.55,
                color: "var(--bb-white)",
                borderLeft: "2px solid var(--bb-amber-dim)",
                paddingLeft: "0.7rem",
                marginBottom: "0.55rem",
              }}
            >
              {hit.snippet}
            </div>

            <div style={{ display: "flex", gap: "0.4rem" }}>
              <Link
                href={`/research/${hit.ikTid}`}
                style={{
                  fontFamily: "var(--bb-font, monospace)",
                  fontSize: "0.58rem",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--bb-amber)",
                  border: "1px solid var(--bb-amber-dim)",
                  padding: "0.2rem 0.55rem",
                  textDecoration: "none",
                }}
              >
                Open research
              </Link>
              <a
                href={hit.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontFamily: "var(--bb-font, monospace)",
                  fontSize: "0.58rem",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--bb-gray)",
                  border: "1px solid var(--bb-border)",
                  padding: "0.2rem 0.55rem",
                  textDecoration: "none",
                }}
              >
                IK source
              </a>
            </div>
          </div>
        ))}
      </div>
    </DashboardShell>
  );
}
