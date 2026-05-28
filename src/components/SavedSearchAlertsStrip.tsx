"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface SavedSearch {
  id: string;
  name: string;
  query: string;
  last_top_distance: number | null;
  last_top_ik_tid: number | null;
  last_run_at: string | null;
  new_matches_since_run: number;
}

function relevancePct(d: number | null): string {
  if (d === null) return "—";
  return `${Math.max(0, Math.min(100, Math.round(((2 - d) / 2) * 100)))}%`;
}

/**
 * Compact strip showing the user's most recent saved-search top matches.
 * Reads from saved_searches.last_top_* bookkeeping — zero new Voyage
 * cost. Surfaces semantic value passively every time the user loads
 * the dashboard. If no saved searches exist, renders an inline CTA.
 */
export function SavedSearchAlertsStrip() {
  const [items, setItems] = useState<SavedSearch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/saved-searches")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: { searches?: SavedSearch[] }) => {
        if (cancelled) return;
        setItems(d.searches || []);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setItems([]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const hits = items.filter((s) => s.last_top_ik_tid !== null).slice(0, 5);

  return (
    <div className="bb-panel">
      <div className="bb-panel-header">
        <span className="bb-panel-title">Saved-Search Alerts</span>
        <Link
          href="/saved-searches"
          style={{
            fontFamily: "var(--bb-font, monospace)",
            fontSize: "0.58rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--bb-amber)",
            textDecoration: "none",
          }}
        >
          All saved →
        </Link>
      </div>
      <div style={{ padding: "0.5rem 0" }}>
        {loading && (
          <div
            style={{
              padding: "0.5rem 1rem",
              color: "var(--bb-amber)",
              fontFamily: "var(--bb-font, monospace)",
              fontSize: "0.62rem",
              letterSpacing: "0.08em",
            }}
          >
            [LOADING ALERTS...] ▊
          </div>
        )}

        {!loading && items.length === 0 && (
          <div
            style={{
              padding: "0.5rem 1rem",
              color: "var(--bb-gray)",
              fontFamily: "var(--bb-font, monospace)",
              fontSize: "0.62rem",
              letterSpacing: "0.06em",
            }}
          >
            No saved searches yet.{" "}
            <Link href="/search/semantic" style={{ color: "var(--bb-amber)" }}>
              Create one
            </Link>
            .
          </div>
        )}

        {!loading && items.length > 0 && hits.length === 0 && (
          <div
            style={{
              padding: "0.5rem 1rem",
              color: "var(--bb-gray)",
              fontFamily: "var(--bb-font, monospace)",
              fontSize: "0.62rem",
              letterSpacing: "0.06em",
            }}
          >
            {items.length} saved · none have been run yet.
          </div>
        )}

        {!loading && hits.length > 0 && (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {hits.map((s) => (
              <li
                key={s.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto auto",
                  gap: "0.5rem",
                  alignItems: "baseline",
                  padding: "0.35rem 1rem",
                  borderBottom: "1px solid rgba(0,0,0,0.05)",
                  fontSize: "0.72rem",
                }}
              >
                <Link
                  href={
                    s.last_top_ik_tid
                      ? `/research/${s.last_top_ik_tid}`
                      : "/saved-searches"
                  }
                  style={{
                    color: "var(--bb-white)",
                    textDecoration: "none",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    minWidth: 0,
                  }}
                  title={s.query}
                >
                  {s.name}
                </Link>
                {s.new_matches_since_run > 0 && (
                  <span
                    style={{
                      fontFamily: "var(--bb-font, monospace)",
                      fontSize: "0.55rem",
                      letterSpacing: "0.06em",
                      color: "var(--bb-amber)",
                      border: "1px solid var(--bb-amber-dim)",
                      padding: "0.05rem 0.35rem",
                      whiteSpace: "nowrap",
                    }}
                  >
                    +{s.new_matches_since_run}
                  </span>
                )}
                <span
                  style={{
                    fontFamily: "var(--bb-font, monospace)",
                    fontSize: "0.6rem",
                    color: "var(--bb-amber-dim)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {relevancePct(s.last_top_distance)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
