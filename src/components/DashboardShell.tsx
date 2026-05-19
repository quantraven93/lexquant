"use client";

import Link from "next/link";
import { Sidebar } from "./Sidebar";
import { StatusBar } from "./StatusBar";

/**
 * App-shell grid:
 *   row 1 (28px)  menubar   — logo + live source chips
 *   row 2 (40px)  topbar    — breadcrumbs / search slot (Pass 2)
 *   row 3 (1fr)   sidebar (220px) + main content
 *   row 4 (22px)  statusbar
 */
export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <div className="bb-menubar">
        <Link href="/dashboard" className="bb-menubar-brand">
          LEXQUANT
        </Link>
        <div className="bb-menubar-divider" />
        <div className="bb-menubar-chips">
          <span className="bb-menubar-chip">
            <span className="bb-menubar-chip-label">SCI</span>
            <span className="live-dot" />
          </span>
          <span className="bb-menubar-chip">
            <span className="bb-menubar-chip-label">eCOURTS</span>
            <span className="live-dot" />
          </span>
          <span className="bb-menubar-chip">
            <span className="bb-menubar-chip-label">IK</span>
            <span className="live-dot" />
          </span>
          <span className="bb-menubar-chip">
            <span className="bb-menubar-chip-label">UPDATE</span>
            <span className="bb-menubar-chip-val">30 MIN</span>
          </span>
          <span className="bb-menubar-chip">
            <span className="bb-menubar-chip-label">ALERTS</span>
            <span className="bb-menubar-chip-val">TG + EMAIL</span>
          </span>
        </div>
      </div>

      <div className="bb-topbar">
        <div className="bb-topbar-crumbs">HOME / Dashboard</div>
        <div className="bb-topbar-search-slot" aria-hidden="true">
          {/* Pass 2: global search lands here */}
          <span className="bb-topbar-search-stub">
            <span>⌘ K</span>
            <span style={{ marginLeft: "0.5rem", opacity: 0.6 }}>
              search cases · statutes · judges · ask AI
            </span>
          </span>
        </div>
        <div className="bb-topbar-actions" aria-hidden="true">
          {/* Pass 2: bell / bookmarks / user chip */}
        </div>
      </div>

      <aside className="bb-sidebar-zone">
        <Sidebar />
      </aside>

      <main className="bb-main-zone">{children}</main>

      <StatusBar />
    </div>
  );
}
