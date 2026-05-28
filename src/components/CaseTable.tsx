"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { format, differenceInDays } from "date-fns";
import { cn, courtTypeBadgeStyle, statusBadgeStyle } from "@/lib/utils";
import { useCaseHover, type HoverCaseData } from "./CaseHoverPreview";

interface CaseRow {
  id: string;
  case_title: string;
  court_type: string;
  court_name: string | null;
  case_type: string | null;
  case_number: string;
  case_year: string | null;
  current_status: string | null;
  next_hearing_date: string | null;
  last_order_date: string | null;
  last_order_summary?: string | null;
  judges?: string | null;
  petitioner: string | null;
  respondent: string | null;
  tags: string[];
}

function rowToHover(c: CaseRow): HoverCaseData {
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

export function CaseTable({ cases }: { cases: CaseRow[] }) {
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const { rowProps, preview } = useCaseHover();

  // Tag vocabulary across all cases, with frequency, descending.
  const tagFreq = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of cases) {
      for (const t of c.tags || []) {
        const key = t.trim();
        if (!key) continue;
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12); // cap to avoid chip overflow
  }, [cases]);

  function toggleTag(tag: string) {
    setActiveTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  const filtered = useMemo(() => {
    let result = cases;
    if (filter !== "all")
      result = result.filter((c) => c.court_type === filter);
    if (activeTags.size > 0) {
      // Intersection semantics — case must carry ALL selected tags. If
      // users want OR, they can deselect down to one chip.
      result = result.filter((c) => {
        const caseTags = new Set((c.tags || []).map((t) => t.trim()));
        for (const t of activeTags) if (!caseTags.has(t)) return false;
        return true;
      });
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.case_title?.toLowerCase().includes(q) ||
          c.case_number?.includes(q) ||
          c.petitioner?.toLowerCase().includes(q) ||
          c.respondent?.toLowerCase().includes(q),
      );
    }
    return result;
  }, [cases, filter, activeTags, search]);

  const courtTabs = [
    { key: "all", label: "All" },
    { key: "SC", label: "SC" },
    { key: "HC", label: "HC" },
    { key: "DC", label: "District" },
    { key: "NCLT", label: "NCLT" },
    { key: "CF", label: "Consumer" },
  ];

  function getHearingStyle(dateStr: string | null) {
    if (!dateStr) return {};
    const days = differenceInDays(new Date(dateStr), new Date());
    if (days < 0) return { color: "var(--bb-red)" };
    if (days <= 7) return { color: "var(--bb-amber)" };
    return { color: "var(--bb-white)" };
  }

  return (
    <div className="bb-panel">
      <div className="bb-panel-header">
        <span className="bb-panel-title">Case Monitor</span>
        <span className="text-muted" style={{ fontSize: "0.6rem" }}>
          {filtered.length} CASES
        </span>
      </div>

      <div
        className="flex items-center justify-between"
        style={{
          background: "var(--bb-panel-header)",
          borderBottom: "1px solid var(--bb-border)",
        }}
      >
        <div className="bb-tabs" style={{ borderBottom: "none", flex: 1 }}>
          {courtTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={cn("bb-tab", filter === tab.key && "active")}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="px-3">
          <input
            type="text"
            placeholder="SEARCH..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              fontSize: "0.65rem",
              padding: "0.25rem 0.5rem",
              width: "140px",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          />
        </div>
      </div>

      {tagFreq.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.3rem",
            padding: "0.4rem 0.75rem",
            background: "var(--bb-panel)",
            borderBottom: "1px solid var(--bb-border)",
          }}
        >
          <span
            style={{
              fontFamily: "var(--bb-font, monospace)",
              fontSize: "0.55rem",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--bb-gray)",
              alignSelf: "center",
              marginRight: "0.2rem",
            }}
          >
            Tags:
          </span>
          {tagFreq.map(([tag, count]) => {
            const active = activeTags.has(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                style={{
                  fontFamily: "var(--bb-font, monospace)",
                  fontSize: "0.58rem",
                  letterSpacing: "0.04em",
                  padding: "0.15rem 0.45rem",
                  border: `1px solid ${
                    active ? "var(--bb-amber)" : "var(--bb-border)"
                  }`,
                  background: active ? "var(--bb-amber)" : "transparent",
                  color: active ? "var(--bb-bg)" : "var(--bb-gray)",
                  cursor: "pointer",
                }}
              >
                {tag} <span style={{ opacity: 0.7 }}>{count}</span>
              </button>
            );
          })}
          {activeTags.size > 0 && (
            <button
              type="button"
              onClick={() => setActiveTags(new Set())}
              style={{
                fontFamily: "var(--bb-font, monospace)",
                fontSize: "0.55rem",
                letterSpacing: "0.06em",
                color: "var(--bb-gray)",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                marginLeft: "auto",
                alignSelf: "center",
              }}
              title="Clear tag filters"
            >
              clear ×
            </button>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="p-8 text-center" style={{ color: "var(--bb-gray)" }}>
          <p style={{ fontSize: "0.8rem", letterSpacing: "0.05em" }}>
            {cases.length === 0 ? "NO CASES TRACKED" : "NO RESULTS"}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="bb-table">
            <thead>
              <tr>
                <th>Case</th>
                <th>Court</th>
                <th>Status</th>
                <th>Next Hearing</th>
                <th>Tags</th>
                <th style={{ width: "30px" }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} {...rowProps(rowToHover(c))}>
                  <td>
                    <div style={{ maxWidth: "280px" }}>
                      <p
                        style={{
                          fontSize: "0.78rem",
                          fontWeight: 500,
                          color: "var(--bb-white)",
                        }}
                        className="truncate"
                      >
                        {c.case_title || `${c.case_number}/${c.case_year}`}
                      </p>
                      <p
                        style={{
                          fontSize: "0.62rem",
                          color: "var(--bb-gray)",
                          marginTop: "1px",
                        }}
                      >
                        {c.case_type ? `${c.case_type} ` : ""}
                        {c.case_number}
                        {c.case_year ? `/${c.case_year}` : ""}
                      </p>
                    </div>
                  </td>
                  <td>
                    <span style={courtTypeBadgeStyle(c.court_type)}>
                      {c.court_type}
                    </span>
                  </td>
                  <td>
                    <span style={statusBadgeStyle(c.current_status)}>
                      {c.current_status || "Unknown"}
                    </span>
                  </td>
                  <td
                    style={{
                      ...getHearingStyle(c.next_hearing_date),
                      fontSize: "0.75rem",
                    }}
                  >
                    {c.next_hearing_date
                      ? format(new Date(c.next_hearing_date), "dd MMM yyyy")
                      : "-"}
                  </td>
                  <td>
                    <div className="flex gap-1 flex-wrap">
                      {(c.tags || []).slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          style={{
                            fontSize: "0.55rem",
                            padding: "0.1rem 0.3rem",
                            border: "1px solid var(--bb-border)",
                            color: "var(--bb-gray)",
                            letterSpacing: "0.03em",
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <Link
                      href={`/case/${c.id}`}
                      style={{
                        color: "var(--bb-amber)",
                        fontSize: "0.8rem",
                        fontWeight: 700,
                      }}
                    >
                      &gt;
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {preview}
    </div>
  );
}
