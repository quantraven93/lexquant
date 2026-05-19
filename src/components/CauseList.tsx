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

export function CauseList() {
  const [rows, setRows] = useState<CauseRow[]>([]);
  const [loading, setLoading] = useState(true);
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
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div
      className="bb-panel"
      style={{ height: "100%", display: "flex", flexDirection: "column" }}
    >
      <div className="bb-panel-header">
        <span className="bb-panel-title">Cause List</span>
        <span className="bb-panel-tag">{rows.length}</span>
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        {loading ? (
          <div className="bb-cause-empty">[LOADING CAUSE LIST...]</div>
        ) : rows.length === 0 ? (
          <div className="bb-cause-empty">
            No upcoming hearings · add cases with next_hearing_date
          </div>
        ) : (
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
                      ? new Date(c.next_hearing_date).toLocaleDateString(
                          "en-IN",
                          {
                            day: "2-digit",
                            month: "short",
                          },
                        )
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
        )}
      </div>
      {preview}
    </div>
  );
}
