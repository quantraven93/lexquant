"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCaseHover, type HoverCaseData } from "./CaseHoverPreview";

interface CauseRow {
  id: string;
  case_title: string;
  case_number: string;
  case_year: string | null;
  case_type: string | null;
  court_type: string;
  court_name: string | null;
  current_status: string | null;
  next_hearing_date: string | null;
  petitioner: string | null;
  respondent: string | null;
  judges?: string | null;
  last_order_summary?: string | null;
  tags?: string[] | null;
}

interface CasesPayload {
  cases?: CauseRow[];
}

interface TapeEntry {
  id: number;
  date: string;
  caseNumber: string[];
  party: string;
  judge: string[];
  bench: string;
  listingNo: number;
  listType: string;
  courtName: string;
  district: string;
  matchedCaseId: string | null;
  matchedCaseTitle: string | null;
}

interface TapePayload {
  configured?: boolean;
  entries?: TapeEntry[];
  note?: string;
}

function bdgClass(court_type: string): string {
  const m: Record<string, string> = {
    SC: "bdg sc",
    HC: "bdg hc",
    DC: "bdg dc",
    NCLT: "bdg nclt",
    CONSUMER: "bdg consumer",
  };
  return m[court_type?.toUpperCase()] || "bdg";
}

function toHover(c: CauseRow): HoverCaseData {
  return {
    id: c.id,
    case_title: c.case_title,
    case_type: c.case_type,
    case_number: c.case_number,
    case_year: c.case_year,
    court_type: c.court_type,
    court_name: c.court_name,
    current_status: c.current_status,
    next_hearing_date: c.next_hearing_date,
    petitioner: c.petitioner,
    respondent: c.respondent,
    judges: c.judges ?? null,
    last_order_summary: c.last_order_summary ?? null,
    tags: c.tags ?? null,
  };
}

function shortDate(d: string): string {
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
  });
}

export function CauseList() {
  const [rows, setRows] = useState<CauseRow[]>([]);
  const [tape, setTape] = useState<TapeEntry[]>([]);
  const [configured, setConfigured] = useState(true);
  const [loadingTape, setLoadingTape] = useState(true);
  const [loadingRows, setLoadingRows] = useState(true);
  const { rowProps, preview } = useCaseHover();

  useEffect(() => {
    fetch("/api/cases")
      .then((r) => r.json())
      .then((d: CasesPayload) => {
        const today = new Date().toISOString().slice(0, 10);
        const filtered = (d.cases || [])
          .filter((c) => c.next_hearing_date && c.next_hearing_date >= today)
          .sort((a, b) =>
            (a.next_hearing_date || "").localeCompare(
              b.next_hearing_date || "",
            ),
          )
          .slice(0, 20);
        setRows(filtered);
        setLoadingRows(false);
      })
      .catch(() => setLoadingRows(false));

    fetch("/api/causelist?days=7")
      .then((r) => r.json())
      .then((d: TapePayload) => {
        setTape(d.entries || []);
        setConfigured(d.configured !== false);
        setLoadingTape(false);
      })
      .catch(() => setLoadingTape(false));
  }, []);

  const loading = loadingTape && loadingRows;

  return (
    <div
      className="bb-panel"
      style={{ height: "100%", display: "flex", flexDirection: "column" }}
    >
      <div className="bb-panel-header">
        <span className="bb-panel-title">Cause List</span>
        <span className="bb-panel-tag">
          {tape.length > 0 ? `${tape.length} LISTED` : `${rows.length}`}
        </span>
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        {loading ? (
          <div className="bb-cause-empty">[LOADING CAUSE LIST...]</div>
        ) : (
          <>
            {/* Real cause-list tape: tracked matters listed in court */}
            {!loadingTape && (
              <div>
                <div className="bb-cause-section-label">
                  LISTED IN COURT · NEXT 7 DAYS
                </div>
                {!configured ? (
                  <div className="bb-cause-empty">
                    cause-list source not configured · set ECOURTSINDIA_MCP_URL
                  </div>
                ) : tape.length === 0 ? (
                  <div className="bb-cause-empty">
                    No tracked matter is listed in the next 7 days
                  </div>
                ) : (
                  <ul className="bb-cause-list">
                    {tape.map((e) => {
                      const label =
                        e.matchedCaseTitle ||
                        e.party ||
                        e.caseNumber.join(", ");
                      const inner = (
                        <>
                          <span className="bb-cause-date">
                            {shortDate(e.date)}
                          </span>
                          <span className="bdg dc">#{e.listingNo || "—"}</span>
                          <span className="bb-cause-title">
                            {label}
                            <span className="bb-cause-sub">
                              {[e.caseNumber.join(", "), e.judge[0], e.district]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </span>
                          <span className="bb-cause-flag">
                            {e.listType || "—"}
                          </span>
                        </>
                      );
                      return (
                        <li key={e.id} className="bb-cause-row">
                          {e.matchedCaseId ? (
                            <Link
                              href={`/case/${e.matchedCaseId}`}
                              style={{
                                display: "contents",
                                color: "inherit",
                                textDecoration: "none",
                              }}
                            >
                              {inner}
                            </Link>
                          ) : (
                            inner
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

            {/* Tracked hearing dates (from case records) */}
            {!loadingRows && rows.length > 0 && (
              <div>
                <div className="bb-cause-section-label">
                  TRACKED HEARING DATES
                </div>
                <ul className="bb-cause-list">
                  {rows.map((c) => {
                    const label =
                      c.case_title ||
                      `${c.case_type || ""} ${c.case_number}/${c.case_year || ""}`.trim();
                    return (
                      <li
                        key={c.id}
                        className="bb-cause-row"
                        {...rowProps(toHover(c))}
                      >
                        <span className="bb-cause-date">
                          {c.next_hearing_date
                            ? shortDate(c.next_hearing_date)
                            : "—"}
                        </span>
                        <span className={bdgClass(c.court_type)}>
                          {(c.court_type || "?").toUpperCase()}
                        </span>
                        <Link href={`/case/${c.id}`} className="bb-cause-title">
                          {label}
                          {c.petitioner || c.respondent ? (
                            <span className="bb-cause-sub">
                              {[c.petitioner, c.respondent]
                                .filter(Boolean)
                                .join(" vs ")}
                            </span>
                          ) : null}
                        </Link>
                        <span className="bb-cause-flag">
                          {c.current_status?.toUpperCase() || "—"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
      {preview}
    </div>
  );
}
