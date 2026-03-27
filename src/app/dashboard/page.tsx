"use client";

import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { StatsCards } from "@/components/StatsCards";
import { CaseTable } from "@/components/CaseTable";

interface CaseData {
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

export default function DashboardPage() {
  const [cases, setCases] = useState<CaseData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/cases")
      .then((r) => r.json())
      .then((data) => {
        setCases(data.cases || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const totalCases = cases.length;
  const pendingCases = cases.filter(
    (c) => c.current_status === "Pending"
  ).length;
  const disposedCases = cases.filter(
    (c) => c.current_status === "Disposed"
  ).length;
  const upcomingHearings = cases.filter((c) => {
    if (!c.next_hearing_date) return false;
    const d = new Date(c.next_hearing_date);
    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    return d >= now && d <= weekFromNow;
  }).length;

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <DashboardShell>
      <div style={{ display: "flex", flexDirection: "column", gap: "1px", background: "var(--bb-border)", minHeight: "100%" }}>
        {/* Header */}
        <div className="bb-panel-header">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span className="bb-panel-title">CASE DASHBOARD</span>
            <span className="live-dot" />
          </div>
          <span style={{ fontSize: "0.6rem", color: "var(--bb-gray)", letterSpacing: "0.05em" }}>{today}</span>
        </div>

        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "16rem", background: "var(--bb-panel)" }}>
            <span style={{ color: "var(--bb-amber)", fontSize: "0.75rem", letterSpacing: "0.1em", fontWeight: 600 }}>[LOADING DATA...]</span>
          </div>
        ) : (
          <>
            <div style={{ background: "var(--bb-panel)" }}>
              <StatsCards
                total={totalCases}
                pending={pendingCases}
                upcomingThisWeek={upcomingHearings}
                disposed={disposedCases}
              />
            </div>
            <div style={{ background: "var(--bb-panel)" }}>
              <CaseTable cases={cases} />
            </div>
          </>
        )}
      </div>
    </DashboardShell>
  );
}
