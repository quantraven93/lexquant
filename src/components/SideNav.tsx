"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface PinnedMatter {
  id: string;
  case_title: string;
  case_number: string;
  case_year: string | null;
  case_type: string | null;
  court_type: string;
  next_hearing_date: string | null;
}

interface SidebarData {
  workspace: {
    matters: number;
    hearingsToday: number;
    saved: number;
    judgments: number;
  };
  courts: Record<string, number>;
  pinned: PinnedMatter[];
}

interface NavRow {
  label: string;
  href: string;
  count?: number;
}

const LIBRARY: NavRow[] = [
  { label: "Semantic Search", href: "/search/semantic" },
  { label: "Citation Graph", href: "/research" },
  { label: "Acts & Bare", href: "/library/acts" },
  { label: "Rules & Notif.", href: "/library/rules" },
  { label: "Commentaries", href: "/library/commentaries" },
];

const COURT_ENTRIES: Array<{ code: string; label: string }> = [
  { code: "SC", label: "SC · Supreme Court" },
  { code: "HC", label: "HC · High Courts" },
  { code: "DC", label: "DC · District" },
  { code: "NCLT", label: "NCLT · Tribunals" },
  { code: "CONSUMER", label: "Consumer Fora" },
];

// Exact-match these to avoid a parent row lighting up when the user is on
// a more-specific sibling route (e.g. /search must NOT highlight when the
// user is on /search/semantic — the latter has its own Library entry).
const EXACT_MATCH_HREFS = new Set(["/dashboard", "/search"]);

function isRowActive(pathname: string, href: string): boolean {
  if (EXACT_MATCH_HREFS.has(href)) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bb-sidenav-section">
      <div className="bb-sidenav-label">{title}</div>
      {children}
    </div>
  );
}

function Row({ row, active }: { row: NavRow; active: boolean }) {
  return (
    <Link
      href={row.href}
      className={`bb-sidenav-row ${active ? "is-active" : ""}`}
    >
      <span className="bb-sidenav-row-label">{row.label}</span>
      {typeof row.count === "number" && row.count > 0 ? (
        <span className="bb-sidenav-row-count">{row.count}</span>
      ) : null}
    </Link>
  );
}

export function SideNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [data, setData] = useState<SidebarData | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/sidebar")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const supabase = createClient();
  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const ws = data?.workspace;
  const workspace: NavRow[] = [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Cause List", href: "/calendar", count: ws?.hearingsToday },
    { label: "Matters", href: "/dashboard", count: ws?.matters },
    { label: "Research", href: "/search", count: ws?.judgments },
    { label: "Saved", href: "/dashboard#watchlist", count: ws?.saved },
    { label: "Briefing", href: "/briefing" },
    { label: "US Opinions", href: "/us-opinions" },
  ];

  return (
    <nav className="bb-sidenav">
      <div className="bb-sidenav-scroll">
        <Section title="Workspace">
          {workspace.map((r) => (
            <Row key={r.label} row={r} active={isRowActive(pathname, r.href)} />
          ))}
        </Section>

        <Section title="Library">
          {LIBRARY.map((r) => (
            <Row
              key={r.label}
              row={r}
              active={pathname.startsWith(r.href) && r.href !== "/research"}
            />
          ))}
        </Section>

        <Section title="Courts">
          {COURT_ENTRIES.map((c) => (
            <Row
              key={c.code}
              row={{
                label: c.label,
                href: `/dashboard?court=${c.code}`,
                count: data?.courts[c.code],
              }}
              active={false}
            />
          ))}
        </Section>

        {data?.pinned && data.pinned.length > 0 ? (
          <Section title="Pinned Matters">
            {data.pinned.map((m) => {
              const label =
                m.case_title ||
                `${m.case_type || ""} ${m.case_number}/${m.case_year || ""}`.trim();
              const sub = m.next_hearing_date
                ? new Date(m.next_hearing_date).toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                  })
                : "—";
              return (
                <Link
                  key={m.id}
                  href={`/case/${m.id}`}
                  className="bb-sidenav-pinned"
                >
                  <span className="bb-sidenav-pinned-label" title={label}>
                    {label}
                  </span>
                  <span className="bb-sidenav-pinned-sub">
                    {m.court_type} · {sub}
                  </span>
                </Link>
              );
            })}
          </Section>
        ) : null}
      </div>

      <button
        type="button"
        onClick={handleLogout}
        className="bb-sidenav-logout"
      >
        Sign Out
      </button>
    </nav>
  );
}
