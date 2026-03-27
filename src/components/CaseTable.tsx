"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { format, differenceInDays } from "date-fns";
import { cn, COURT_TYPE_COLORS, STATUS_COLORS } from "@/lib/utils";

interface CaseRow {
  id: string;
  case_title: string;
  court_type: string;
  court_name: string | null;
  case_number: string;
  case_year: string | null;
  current_status: string | null;
  next_hearing_date: string | null;
  last_order_date: string | null;
  petitioner: string | null;
  respondent: string | null;
  tags: string[];
}

export function CaseTable({ cases }: { cases: CaseRow[] }) {
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    let result = cases;
    if (filter !== "all") result = result.filter((c) => c.court_type === filter);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.case_title?.toLowerCase().includes(q) ||
          c.case_number?.includes(q) ||
          c.petitioner?.toLowerCase().includes(q) ||
          c.respondent?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [cases, filter, search]);

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
    if (days < 0) return { color: 'var(--bb-red)' };
    if (days <= 7) return { color: 'var(--bb-amber)' };
    return { color: 'var(--bb-white)' };
  }

  return (
    <div className="bb-panel">
      <div className="bb-panel-header">
        <span className="bb-panel-title">Case Monitor</span>
        <span className="text-muted" style={{ fontSize: '0.6rem' }}>
          {filtered.length} CASES
        </span>
      </div>

      <div className="flex items-center justify-between" style={{ background: 'var(--bb-panel-header)', borderBottom: '1px solid var(--bb-border)' }}>
        <div className="bb-tabs" style={{ borderBottom: 'none', flex: 1 }}>
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
              fontSize: '0.65rem',
              padding: '0.25rem 0.5rem',
              width: '140px',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="p-8 text-center" style={{ color: 'var(--bb-gray)' }}>
          <p style={{ fontSize: '0.8rem', letterSpacing: '0.05em' }}>
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
                <th style={{ width: '30px' }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div style={{ maxWidth: '280px' }}>
                      <p style={{ fontSize: '0.78rem', fontWeight: 500, color: 'var(--bb-white)' }} className="truncate">
                        {c.case_title || `${c.case_number}/${c.case_year}`}
                      </p>
                      <p style={{ fontSize: '0.62rem', color: 'var(--bb-gray)', marginTop: '1px' }}>
                        {c.case_number}{c.case_year ? `/${c.case_year}` : ""}
                      </p>
                    </div>
                  </td>
                  <td>
                    <span
                      className={cn(
                        "inline-flex px-1.5 py-0.5 text-xs font-semibold",
                        COURT_TYPE_COLORS[c.court_type] || "bg-gray-800/50 text-gray-500"
                      )}
                      style={{ fontSize: '0.6rem', letterSpacing: '0.04em' }}
                    >
                      {c.court_type}
                    </span>
                  </td>
                  <td>
                    <span
                      className={cn(
                        "inline-flex px-1.5 py-0.5 text-xs font-semibold",
                        STATUS_COLORS[c.current_status || "Unknown"] ||
                          "bg-gray-800/50 text-gray-500"
                      )}
                      style={{ fontSize: '0.6rem', letterSpacing: '0.04em' }}
                    >
                      {c.current_status || "Unknown"}
                    </span>
                  </td>
                  <td style={{ ...getHearingStyle(c.next_hearing_date), fontSize: '0.75rem' }}>
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
                            fontSize: '0.55rem',
                            padding: '0.1rem 0.3rem',
                            border: '1px solid var(--bb-border)',
                            color: 'var(--bb-gray)',
                            letterSpacing: '0.03em',
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
                      style={{ color: 'var(--bb-amber)', fontSize: '0.8rem', fontWeight: 700 }}
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
    </div>
  );
}
