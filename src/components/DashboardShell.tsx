"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SideNav } from "./SideNav";
import { StatusBar } from "./StatusBar";
import { TopBar } from "./TopBar";

interface SourceHealth {
  ok: boolean;
  last: string | null;
}

interface HealthPayload {
  sources?: {
    ik?: SourceHealth;
    sci?: SourceHealth;
    ecourts?: SourceHealth;
  };
}

function SourceDot({ health }: { health?: SourceHealth }) {
  // Unknown (still loading / endpoint down) renders dim, not green —
  // the dot only claims live when the pipeline actually ran recently.
  const ok = health?.ok === true;
  const title = health?.last
    ? `last run ${new Date(health.last).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })} IST`
    : "no run recorded";
  return (
    <span
      className="live-dot"
      title={title}
      style={
        ok
          ? undefined
          : { background: "var(--bb-gray-dim, #999)", boxShadow: "none" }
      }
    />
  );
}

/**
 * App-shell grid:
 *   row 1 (28px)  menubar   — logo + live source chips
 *   row 2 (40px)  topbar    — breadcrumbs / search slot (Pass 2)
 *   row 3 (1fr)   sidebar (220px) + main content
 *   row 4 (22px)  statusbar
 */
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [health, setHealth] = useState<HealthPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled) setHealth(d);
      })
      .catch(() => {
        if (!cancelled) setHealth(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
            <SourceDot health={health?.sources?.sci} />
          </span>
          <span className="bb-menubar-chip">
            <span className="bb-menubar-chip-label">eCOURTS</span>
            <SourceDot health={health?.sources?.ecourts} />
          </span>
          <span className="bb-menubar-chip">
            <span className="bb-menubar-chip-label">IK</span>
            <SourceDot health={health?.sources?.ik} />
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
