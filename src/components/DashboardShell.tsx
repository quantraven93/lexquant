"use client";

import { Sidebar } from "./Sidebar";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen" style={{ background: 'var(--bb-bg)' }}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="bb-ticker-strip">
          <div className="bb-tick-item">
            <span className="bb-tick-label">SCI</span>
            <span className="live-dot" />
          </div>
          <div className="bb-tick-item">
            <span className="bb-tick-label">eCOURTS</span>
            <span className="live-dot" />
          </div>
          <div className="bb-tick-item">
            <span className="bb-tick-label">UPDATE</span>
            <span className="bb-tick-value">30 MIN</span>
          </div>
          <div className="bb-tick-item">
            <span className="bb-tick-label">ALERTS</span>
            <span className="bb-tick-value">TG + EMAIL</span>
          </div>
        </div>
        <main className="flex-1 overflow-auto p-4" style={{ background: 'var(--bb-bg)' }}>
          {children}
        </main>
      </div>
    </div>
  );
}
