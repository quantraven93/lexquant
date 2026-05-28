"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/DashboardShell";

interface SavedSearch {
  id: string;
  name: string;
  query: string;
  structure_filter: string[] | null;
  court_filter: string[] | null;
  created_at: string;
  last_run_at: string | null;
  last_top_distance: number | null;
  last_top_ik_tid: number | null;
  new_matches_since_run: number;
}

function formatDate(iso: string | null): string {
  if (!iso) return "never";
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function relevancePct(d: number | null): string {
  if (d === null) return "—";
  const pct = Math.max(0, Math.min(100, Math.round(((2 - d) / 2) * 100)));
  return `${pct}%`;
}

export default function SavedSearchesPage() {
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function fetchSearches(): Promise<{
    ok: boolean;
    rows?: SavedSearch[];
    err?: string;
  }> {
    try {
      const res = await fetch("/api/saved-searches");
      const data = await res.json();
      if (!res.ok)
        return { ok: false, err: data?.error || `Failed (${res.status})` };
      return { ok: true, rows: (data.searches as SavedSearch[]) || [] };
    } catch (e) {
      return {
        ok: false,
        err: e instanceof Error ? e.message : "Network error",
      };
    }
  }

  async function reload() {
    setLoading(true);
    setError(null);
    const r = await fetchSearches();
    if (r.ok) setSearches(r.rows || []);
    else setError(r.err || "Failed");
    setLoading(false);
  }

  // Initial load — `loading` is already initialised to true via useState,
  // so we don't need to setLoading(true) here (which would trigger the
  // react-hooks/set-state-in-effect rule). Only the post-fetch updates run.
  useEffect(() => {
    let cancelled = false;
    fetchSearches().then((r) => {
      if (cancelled) return;
      if (r.ok) setSearches(r.rows || []);
      else setError(r.err || "Failed");
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function runSearch(id: string) {
    setRunningId(id);
    try {
      const res = await fetch(`/api/saved-searches/${id}/run`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data?.error || `Run failed (${res.status})`);
      } else {
        // Reload so the bookkeeping fields refresh.
        await reload();
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Network error");
    }
    setRunningId(null);
  }

  async function deleteSearch(id: string, name: string) {
    if (!confirm(`Remove saved search "${name}"?`)) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/saved-searches/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setSearches((prev) => prev.filter((s) => s.id !== id));
      } else {
        const data = await res.json();
        alert(data?.error || `Delete failed (${res.status})`);
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Network error");
    }
    setDeletingId(null);
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
          <span className="bb-panel-title">SAVED SEARCHES</span>
          <span
            style={{
              fontSize: "0.58rem",
              color: "var(--bb-gray)",
              letterSpacing: "0.08em",
            }}
          >
            Save a semantic query to re-run later
          </span>
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
              [LOADING SAVED SEARCHES...]
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

        {!loading && !error && searches.length === 0 && (
          <div className="bb-panel">
            <div
              style={{
                padding: "2rem",
                textAlign: "center",
                color: "var(--bb-gray)",
                fontSize: "0.78rem",
              }}
            >
              No saved searches yet. Run a query on{" "}
              <Link
                href="/search/semantic"
                style={{ color: "var(--bb-amber)" }}
              >
                /search/semantic
              </Link>{" "}
              and use the [Save] button to add one here.
            </div>
          </div>
        )}

        {!loading &&
          !error &&
          searches.map((s) => (
            <div
              className="bb-panel"
              key={s.id}
              style={{ padding: "0.85rem 1rem" }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: "1rem",
                  marginBottom: "0.45rem",
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontFamily: "var(--bb-font-serif, Georgia, serif)",
                      fontSize: "0.95rem",
                      color: "var(--bb-white)",
                      lineHeight: 1.3,
                      marginBottom: "0.2rem",
                    }}
                  >
                    {s.name}
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--bb-font, monospace)",
                      fontSize: "0.6rem",
                      color: "var(--bb-gray)",
                      letterSpacing: "0.04em",
                    }}
                  >
                    &quot;
                    {s.query.length > 140
                      ? s.query.slice(0, 140) + "…"
                      : s.query}
                    &quot;
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.35rem" }}>
                  <button
                    type="button"
                    onClick={() => runSearch(s.id)}
                    disabled={runningId === s.id}
                    className="bb-btn bb-btn-primary"
                    style={{
                      padding: "0.25rem 0.55rem",
                      fontSize: "0.6rem",
                      opacity: runningId === s.id ? 0.6 : 1,
                    }}
                  >
                    {runningId === s.id ? "[...]" : "[RUN]"}
                  </button>
                  <Link
                    href={`/search/semantic?q=${encodeURIComponent(s.query)}`}
                    className="bb-btn bb-btn-secondary"
                    style={{
                      padding: "0.25rem 0.55rem",
                      fontSize: "0.6rem",
                      textDecoration: "none",
                      display: "inline-block",
                    }}
                  >
                    [OPEN]
                  </Link>
                  <button
                    type="button"
                    onClick={() => deleteSearch(s.id, s.name)}
                    disabled={deletingId === s.id}
                    className="bb-btn bb-btn-danger"
                    style={{
                      padding: "0.25rem 0.55rem",
                      fontSize: "0.6rem",
                      opacity: deletingId === s.id ? 0.6 : 1,
                    }}
                  >
                    [DEL]
                  </button>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: "1.2rem",
                  flexWrap: "wrap",
                  fontFamily: "var(--bb-font, monospace)",
                  fontSize: "0.6rem",
                  color: "var(--bb-gray)",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                <span>Last run: {formatDate(s.last_run_at)}</span>
                <span>Top match: {relevancePct(s.last_top_distance)}</span>
                {s.last_top_ik_tid && (
                  <Link
                    href={`/research/${s.last_top_ik_tid}`}
                    style={{ color: "var(--bb-amber)" }}
                  >
                    Open top &rarr;
                  </Link>
                )}
                {s.new_matches_since_run > 0 && (
                  <span style={{ color: "var(--bb-amber)" }}>
                    {s.new_matches_since_run} new since last
                  </span>
                )}
                {(s.structure_filter?.length ?? 0) > 0 && (
                  <span>filter: {s.structure_filter?.join(", ")}</span>
                )}
                {(s.court_filter?.length ?? 0) > 0 && (
                  <span>courts: {s.court_filter?.join(", ")}</span>
                )}
              </div>
            </div>
          ))}
      </div>
    </DashboardShell>
  );
}
