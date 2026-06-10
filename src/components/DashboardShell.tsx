"use client";

import Link from "next/link";
import { SideNav } from "./SideNav";
import { StatusBar } from "./StatusBar";
import { TopBar } from "./TopBar";

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
            <span className="bb-menubar-chip-val">EMAIL</span>
          </span>
        </div>
      </div>

      <TopBar />

      <aside className="bb-sidebar-zone">
        <SideNav />
      </aside>

      <main className="bb-main-zone">{children}</main>

      <StatusBar />
    </div>
  );
}
