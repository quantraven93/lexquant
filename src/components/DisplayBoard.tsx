"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface AphcRow {
  court: string;
  status: "not_in_session" | "session_started" | "hearing";
  item: string | null;
  coram: string | null;
  keptBack: string | null;
}

interface SciRow {
  court: string;
  status: "not_in_session" | "hearing";
  message: string | null;
  item: string | null;
  caseNo: string | null;
  causeTitle: string | null;
  advocates: string | null;
}

interface BoardPayload {
  aphc?: { rows: AphcRow[]; error: string | null };
  sci?: { rows: SciRow[]; error: string | null };
  fetchedAt?: string;
  error?: string;
}

type Tab = "aphc" | "sci";

const POLL_MS = 60_000;

/** Courts sit roughly 10:00–17:30 IST on working days. */
function istCourtHours(): boolean {
  const ist = new Date(
    Date.now() + (5.5 * 60 + new Date().getTimezoneOffset()) * 60_000,
  );
  const day = ist.getDay();
  if (day === 0 || day === 6) return false;
  const mins = ist.getHours() * 60 + ist.getMinutes();
  return mins >= 10 * 60 && mins <= 17 * 60 + 30;
}

function TabButton({
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
      className={`bb-digest-tab ${active ? "is-active" : ""}`}
    >
      {label}
    </button>
  );
}

export function DisplayBoard() {
  const [tab, setTab] = useState<Tab>("aphc");
  const [data, setData] = useState<BoardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/displayboard");
      const d = (await r.json()) as BoardPayload;
      if (!r.ok || d.error) {
        setError(d.error || `HTTP ${r.status}`);
      } else {
        setData(d);
        setError(null);
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
      // Outside court hours one fetch per mount is plenty; the boards
      // only change while the courts sit.
      if (istCourtHours()) load();
    }, POLL_MS);
    return () => {
      clearTimeout(kick);
      if (timer.current) clearInterval(timer.current);
    };
  }, [load]);

  const aphcHearing = (data?.aphc?.rows || []).filter(
    (r) => r.status === "hearing",
  );
  const sciHearing = (data?.sci?.rows || []).filter(
    (r) => r.status === "hearing",
  );
  const activeHearing = tab === "aphc" ? aphcHearing.length : sciHearing.length;
  const activeError = tab === "aphc" ? data?.aphc?.error : data?.sci?.error;

  return (
    <div
      className="bb-panel"
      style={{ display: "flex", flexDirection: "column", minHeight: 0 }}
    >
      <div
        className="bb-panel-header"
        style={{ alignItems: "stretch", paddingTop: 0, paddingBottom: 0 }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <span className="bb-panel-title">Display Board</span>
          <span style={{ display: "flex", gap: "0.25rem" }}>
            <TabButton
              active={tab === "aphc"}
              label={`AP HC${aphcHearing.length ? ` · ${aphcHearing.length}` : ""}`}
              onClick={() => setTab("aphc")}
            />
            <TabButton
              active={tab === "sci"}
              label={`SC${sciHearing.length ? ` · ${sciHearing.length}` : ""}`}
              onClick={() => setTab("sci")}
            />
          </span>
        </div>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.3rem",
          }}
        >
          {activeHearing > 0 ? <span className="live-dot" /> : null}
          <span className="bb-panel-tag">
            {activeHearing > 0
              ? `${activeHearing} HALLS SITTING`
              : "NOT IN SESSION"}
          </span>
        </span>
      </div>

      <div style={{ flex: 1, overflow: "auto" }}>
        {loading ? (
          <div className="bb-cause-empty">[LOADING BOARDS...]</div>
        ) : error ? (
          <div className="bb-cause-empty">boards unreachable · {error}</div>
        ) : activeError ? (
          <div className="bb-cause-empty">
            board unreachable · {activeError}
          </div>
        ) : activeHearing === 0 ? (
          <div className="bb-cause-empty">
            Court not in session · board lights up ~10:30 IST on working days
          </div>
        ) : tab === "aphc" ? (
          <ul className="bb-cause-list">
            {aphcHearing.map((r) => (
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
        ) : (
          <ul className="bb-cause-list">
            {sciHearing.map((r) => (
              <li key={r.court} className="bb-board-row bb-board-row-sci">
                <span className="bb-board-court">CT {r.court}</span>
                <span className="bb-board-item">ITEM {r.item || "—"}</span>
                <span
                  className="bb-board-coram"
                  title={[r.causeTitle, r.advocates]
                    .filter(Boolean)
                    .join(" · ")}
                >
                  {r.causeTitle || r.message || "—"}
                  {r.caseNo ? (
                    <span className="bb-cause-sub">{r.caseNo}</span>
                  ) : null}
                </span>
                <span className="bb-cause-flag" />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bb-digest-footer">
        sources: aphc.gov.in + wdb.sci.gov.in · polls 60s during court hours
        {data?.fetchedAt
          ? ` · as of ${new Date(data.fetchedAt).toLocaleTimeString("en-IN", {
              timeZone: "Asia/Kolkata",
              hour: "2-digit",
              minute: "2-digit",
            })} IST`
          : ""}
      </div>
    </div>
  );
}
