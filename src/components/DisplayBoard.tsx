"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface BoardRow {
  court: string;
  status: "not_in_session" | "session_started" | "hearing";
  item: string | null;
  coram: string | null;
  keptBack: string | null;
}

interface BoardPayload {
  rows?: BoardRow[];
  inSession?: number;
  fetchedAt?: string;
  error?: string;
}

const POLL_MS = 60_000;

/** Court sits roughly 10:00–17:30 IST; outside that window poll lazily. */
function istCourtHours(): boolean {
  const ist = new Date(
    Date.now() + (5.5 * 60 + new Date().getTimezoneOffset()) * 60_000,
  );
  const day = ist.getDay();
  if (day === 0 || day === 6) return false;
  const mins = ist.getHours() * 60 + ist.getMinutes();
  return mins >= 10 * 60 && mins <= 17 * 60 + 30;
}

export function DisplayBoard() {
  const [rows, setRows] = useState<BoardRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [asOf, setAsOf] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/displayboard");
      const d = (await r.json()) as BoardPayload;
      if (!r.ok || d.error) {
        setError(d.error || `HTTP ${r.status}`);
      } else {
        setRows(d.rows || []);
        setError(null);
        setAsOf(d.fetchedAt || null);
      }
    } catch {
      setError("network error");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // Deferred a tick so no setState lands synchronously in the effect.
    const kick = setTimeout(load, 0);
    timer.current = setInterval(() => {
      // Outside court hours one fetch per mount is plenty; the board
      // only changes while the court sits.
      if (istCourtHours()) load();
    }, POLL_MS);
    return () => {
      clearTimeout(kick);
      if (timer.current) clearInterval(timer.current);
    };
  }, [load]);

  const hearing = rows.filter((r) => r.status === "hearing");
  const live = hearing.length > 0;

  return (
    <div
      className="bb-panel"
      style={{ display: "flex", flexDirection: "column", minHeight: 0 }}
    >
      <div className="bb-panel-header">
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span className="bb-panel-title">AP HC Display Board</span>
          {live ? <span className="live-dot" /> : null}
        </div>
        <span className="bb-panel-tag">
          {live ? `${hearing.length} HALLS SITTING` : "NOT IN SESSION"}
        </span>
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        {loading ? (
          <div className="bb-cause-empty">[LOADING BOARD...]</div>
        ) : error ? (
          <div className="bb-cause-empty">board unreachable · {error}</div>
        ) : !live ? (
          <div className="bb-cause-empty">
            Court not in session · board lights up ~10:30 IST on working days
          </div>
        ) : (
          <ul className="bb-cause-list">
            {hearing.map((r) => (
              <li key={r.court} className="bb-board-row">
                <span className="bb-board-court">HALL {r.court}</span>
                <span className="bb-board-item">ITEM {r.item}</span>
                <span className="bb-board-coram" title={r.coram || ""}>
                  {r.coram || "—"}
                </span>
                <span className="bb-cause-flag">
                  {r.keptBack ? `KB ${r.keptBack}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="bb-digest-footer">
        source: aphc.gov.in · polls 60s during court hours
        {asOf
          ? ` · as of ${new Date(asOf).toLocaleTimeString("en-IN", {
              timeZone: "Asia/Kolkata",
              hour: "2-digit",
              minute: "2-digit",
            })} IST`
          : ""}
      </div>
    </div>
  );
}
