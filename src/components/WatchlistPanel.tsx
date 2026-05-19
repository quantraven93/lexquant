"use client";

import { useCallback, useEffect, useState } from "react";
import type { WatchlistItem, WatchlistSourceType } from "@/lib/watchlist/types";

const TYPE_BADGES: Record<string, string> = {
  judgment: "JGM",
  news: "NWS",
  case: "CAS",
  url: "URL",
};

const ROW_STYLE: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "60px 1fr auto auto",
  gap: "0.5rem",
  alignItems: "baseline",
  padding: "0.4rem 0.75rem",
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

function HeaderButton({
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
      style={{
        background: "transparent",
        border: "none",
        cursor: "pointer",
        fontFamily: "var(--bb-font, monospace)",
        fontSize: "0.6rem",
        fontWeight: 700,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: active ? "var(--bb-amber)" : "var(--bb-gray)",
        padding: "0.1rem 0.4rem",
      }}
    >
      {label}
    </button>
  );
}

function AddForm({
  onAdded,
  onCancel,
}: {
  onAdded: (item: WatchlistItem) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim() || !url.trim()) {
      setError("Label and URL are required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, url, note }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || `Failed (${res.status})`);
        setSubmitting(false);
        return;
      }
      onAdded(data.item);
      setLabel("");
      setUrl("");
      setNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      style={{
        display: "grid",
        gap: "0.4rem",
        padding: "0.75rem",
        background: "var(--bb-panel-alt)",
        borderBottom: "1px solid var(--bb-border)",
        fontSize: "0.72rem",
      }}
    >
      <input
        type="text"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Label (e.g., Bhima Koregaon — SC bail)"
        required
        autoFocus
        style={{
          background: "var(--bb-panel)",
          border: "1px solid var(--bb-border)",
          padding: "0.35rem 0.5rem",
          fontFamily: "var(--bb-font-sans)",
          fontSize: "0.72rem",
          color: "var(--bb-white)",
        }}
      />
      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="URL (IK doc, eCourts case, news article, anything)"
        required
        style={{
          background: "var(--bb-panel)",
          border: "1px solid var(--bb-border)",
          padding: "0.35rem 0.5rem",
          fontFamily: "var(--bb-font, monospace)",
          fontSize: "0.68rem",
          color: "var(--bb-white)",
        }}
      />
      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (optional)"
        style={{
          background: "var(--bb-panel)",
          border: "1px solid var(--bb-border)",
          padding: "0.35rem 0.5rem",
          fontFamily: "var(--bb-font-sans)",
          fontSize: "0.72rem",
          color: "var(--bb-white)",
        }}
      />
      {error ? (
        <div
          style={{
            color: "var(--bb-red)",
            fontSize: "0.65rem",
            letterSpacing: "0.04em",
          }}
        >
          {error}
        </div>
      ) : null}
      <div
        style={{ display: "flex", gap: "0.4rem", justifyContent: "flex-end" }}
      >
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          style={{
            background: "transparent",
            border: "1px solid var(--bb-border)",
            padding: "0.3rem 0.7rem",
            fontFamily: "var(--bb-font, monospace)",
            fontSize: "0.6rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--bb-gray)",
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          style={{
            background: "var(--bb-amber)",
            border: "1px solid var(--bb-amber)",
            padding: "0.3rem 0.9rem",
            fontFamily: "var(--bb-font, monospace)",
            fontSize: "0.6rem",
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--bb-bg)",
            cursor: submitting ? "wait" : "pointer",
          }}
        >
          {submitting ? "Adding…" : "Add"}
        </button>
      </div>
    </form>
  );
}

export function WatchlistPanel() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<"all" | WatchlistSourceType>("all");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/watchlist");
      const data = await res.json();
      setItems(data.items || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (id: string) => {
    const prev = items;
    setItems(items.filter((i) => i.id !== id));
    try {
      const res = await fetch(`/api/watchlist/${id}`, { method: "DELETE" });
      if (!res.ok) setItems(prev);
    } catch {
      setItems(prev);
    }
  };

  const filtered =
    filter === "all" ? items : items.filter((i) => i.source_type === filter);

  const filters: Array<"all" | WatchlistSourceType> = [
    "all",
    "judgment",
    "news",
    "case",
    "url",
  ];

  return (
    <div className="bb-panel">
      <div className="bb-panel-header">
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <span className="bb-panel-title">Watchlist</span>
          <span style={{ display: "flex", gap: "0.15rem" }}>
            {filters.map((f) => (
              <HeaderButton
                key={f}
                active={filter === f}
                label={f === "all" ? "All" : f}
                onClick={() => setFilter(f)}
              />
            ))}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          style={{
            background: adding ? "transparent" : "var(--bb-amber)",
            border: `1px solid ${adding ? "var(--bb-border)" : "var(--bb-amber)"}`,
            padding: "0.2rem 0.6rem",
            fontFamily: "var(--bb-font, monospace)",
            fontSize: "0.6rem",
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: adding ? "var(--bb-gray)" : "var(--bb-bg)",
            cursor: "pointer",
          }}
        >
          {adding ? "Close" : "+ Add"}
        </button>
      </div>

      {adding ? (
        <AddForm
          onAdded={(item) => {
            setItems([item, ...items]);
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      ) : null}

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
          [LOADING WATCHLIST...]
        </div>
      ) : filtered.length === 0 ? (
        <div
          style={{
            padding: "1.5rem",
            textAlign: "center",
            color: "var(--bb-gray)",
            fontSize: "0.7rem",
            letterSpacing: "0.08em",
          }}
        >
          {items.length === 0
            ? "WATCHLIST EMPTY · click + Add to bookmark a judgment / case / article"
            : `NO ITEMS IN ${filter.toUpperCase()}`}
        </div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {filtered.map((item) => (
            <li key={item.id} style={ROW_STYLE}>
              <span style={BADGE_STYLE}>
                {TYPE_BADGES[item.source_type || "url"] || "URL"}
              </span>
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: "var(--bb-white)",
                  fontFamily: "var(--bb-font-serif, Georgia, serif)",
                  textDecoration: "none",
                  lineHeight: 1.4,
                }}
              >
                {item.label}
                {item.note ? (
                  <span
                    style={{
                      color: "var(--bb-gray)",
                      fontFamily: "var(--bb-font, monospace)",
                      fontSize: "0.62rem",
                      marginLeft: "0.5rem",
                    }}
                  >
                    · {item.note}
                  </span>
                ) : null}
              </a>
              <span style={DATE_STYLE}>
                {new Date(item.added_at).toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                })}
              </span>
              <button
                type="button"
                onClick={() => remove(item.id)}
                aria-label="Remove from watchlist"
                title="Remove"
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "var(--bb-font, monospace)",
                  fontSize: "0.75rem",
                  color: "var(--bb-gray-dim)",
                  padding: "0 0.25rem",
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
