"use client";

import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
} from "date-fns";
import Link from "next/link";

interface HearingEvent {
  id: string;
  case_title: string;
  court_type: string;
  case_number: string;
  next_hearing_date: string;
}

export default function CalendarPage() {
  const [cases, setCases] = useState<HearingEvent[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/cases")
      .then((r) => r.json())
      .then((data) => {
        setCases(
          (data.cases || []).filter(
            (c: HearingEvent) => c.next_hearing_date
          )
        );
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  function getCasesForDay(day: Date) {
    return cases.filter((c) =>
      isSameDay(new Date(c.next_hearing_date), day)
    );
  }

  const weekDays = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

  return (
    <DashboardShell>
      <div style={{ display: "flex", flexDirection: "column", gap: "1px", background: "var(--bb-border)", minHeight: "100%" }}>
        {/* Header */}
        <div className="bb-panel-header">
          <span className="bb-panel-title">HEARING SCHEDULE</span>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <button
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              style={{ background: "none", border: "none", color: "var(--bb-amber)", cursor: "pointer", fontSize: "0.75rem", fontFamily: "var(--bb-font)", fontWeight: 700 }}
            >
              &lt;
            </button>
            <span style={{ fontSize: "0.68rem", color: "var(--bb-white)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", minWidth: "120px", textAlign: "center" }}>
              {format(currentMonth, "MMMM yyyy")}
            </span>
            <button
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              style={{ background: "none", border: "none", color: "var(--bb-amber)", cursor: "pointer", fontSize: "0.75rem", fontFamily: "var(--bb-font)", fontWeight: 700 }}
            >
              &gt;
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "16rem", background: "var(--bb-panel)" }}>
            <span style={{ color: "var(--bb-amber)", fontSize: "0.75rem", letterSpacing: "0.1em", fontWeight: 600 }}>[LOADING DATA...]</span>
          </div>
        ) : (
          <div className="bb-panel" style={{ overflow: "hidden" }}>
            {/* Week day headers */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: "1px solid var(--bb-border)" }}>
              {weekDays.map((day) => (
                <div
                  key={day}
                  style={{ padding: "0.4rem", textAlign: "center", fontSize: "0.6rem", color: "var(--bb-gray)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
              {days.map((day, i) => {
                const dayCases = getCasesForDay(day);
                const isToday = isSameDay(day, new Date());
                const isCurrentMonth = isSameMonth(day, currentMonth);

                return (
                  <div
                    key={i}
                    style={{
                      minHeight: "90px",
                      padding: "0.3rem",
                      borderBottom: "1px solid var(--bb-border)",
                      borderRight: "1px solid var(--bb-border)",
                      background: !isCurrentMonth ? "rgba(10,14,23,0.5)" : "transparent",
                    }}
                  >
                    <p
                      style={{
                        fontSize: "0.78rem",
                        fontWeight: isToday ? 700 : 500,
                        marginBottom: "0.2rem",
                        color: isToday
                          ? "var(--bb-amber)"
                          : isCurrentMonth
                          ? "var(--bb-white)"
                          : "var(--bb-gray-dim)",
                        textDecoration: isToday ? "underline" : "none",
                        textUnderlineOffset: "2px",
                      }}
                    >
                      {format(day, "d")}
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                      {dayCases.slice(0, 3).map((c) => (
                        <Link
                          key={c.id}
                          href={`/case/${c.id}`}
                          style={{
                            display: "block",
                            fontSize: "0.6rem",
                            color: "var(--bb-amber)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            textDecoration: "none",
                          }}
                          title={c.case_title || c.case_number}
                        >
                          {c.case_title
                            ? c.case_title.substring(0, 20)
                            : c.case_number}
                        </Link>
                      ))}
                      {dayCases.length > 3 && (
                        <p style={{ fontSize: "0.55rem", color: "var(--bb-gray)" }}>
                          +{dayCases.length - 3} more
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
