"use client";

interface TickerStripProps {
  total: number;
  pending: number;
  upcomingThisWeek: number;
  hearingsToday: number;
  disposed: number;
  watchlist: number;
  newJudgmentsToday?: number;
  newNewsToday?: number;
}

/**
 * Inline single-row ticker that replaces the old four-card StatsCards
 * panel. Sits between the topbar and the dashboard grid; reuses the
 * existing `bb-ticker-strip` token system.
 */
export function TickerStrip({
  total,
  pending,
  upcomingThisWeek,
  hearingsToday,
  disposed,
  watchlist,
  newJudgmentsToday,
  newNewsToday,
}: TickerStripProps) {
  const items: Array<{ label: string; value: number | string }> = [
    { label: "TOTAL", value: total },
    { label: "PENDING", value: pending },
    { label: "HEARING TODAY", value: hearingsToday },
    { label: "THIS WK", value: upcomingThisWeek },
    { label: "DISPOSED", value: disposed },
    { label: "WATCH", value: watchlist },
  ];
  if (typeof newJudgmentsToday === "number") {
    items.push({ label: "NEW JUDG", value: newJudgmentsToday });
  }
  if (typeof newNewsToday === "number") {
    items.push({ label: "NEW NEWS", value: newNewsToday });
  }
  return (
    <div className="bb-ticker-strip">
      {items.map((it) => (
        <div key={it.label} className="bb-tick-item">
          <span className="bb-tick-label">{it.label}</span>
          <span className="bb-tick-value">{it.value}</span>
        </div>
      ))}
    </div>
  );
}
