"use client";

interface StatsCardsProps {
  total: number;
  pending: number;
  upcomingThisWeek: number;
  disposed: number;
}

export function StatsCards({
  total,
  pending,
  upcomingThisWeek,
  disposed,
}: StatsCardsProps) {
  const stats = [
    { label: "Total Cases", value: total },
    { label: "Pending", value: pending },
    { label: "Hearings 7D", value: upcomingThisWeek },
    { label: "Disposed", value: disposed },
  ];

  return (
    <div className="bb-panel">
      <div className="bb-panel-header">
        <span className="bb-panel-title">Portfolio Summary</span>
        <span className="bb-panel-tag">Live</span>
      </div>
      <div className="bb-macro-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {stats.map((stat) => (
          <div key={stat.label} className="bb-macro-cell">
            <span className="bb-macro-label">{stat.label}</span>
            <span className="bb-macro-val">{stat.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
