"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Search,
  CalendarDays,
  Settings,
  PlusCircle,
  LogOut,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/add", label: "Add Case", icon: PlusCircle },
  { href: "/search", label: "Search", icon: Search },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <aside className="w-52 flex flex-col border-r" style={{ background: 'var(--bb-bg)', borderColor: 'var(--bb-border)' }}>
      <div className="px-4 py-4 border-b" style={{ borderColor: 'var(--bb-border)' }}>
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="text-base font-bold tracking-widest" style={{ color: 'var(--bb-amber)' }}>
            LEXQUANT
          </span>
        </Link>
        <div className="flex items-center gap-1.5 mt-1">
          <span className="live-dot" />
          <p className="text-muted" style={{ fontSize: '0.58rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Court Terminal
          </p>
        </div>
      </div>

      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 text-xs font-semibold tracking-wide uppercase transition-colors",
                isActive
                  ? "border-l-2"
                  : "border-l-2 border-transparent hover:opacity-80"
              )}
              style={{
                color: isActive ? 'var(--bb-amber)' : 'var(--bb-gray)',
                borderLeftColor: isActive ? 'var(--bb-amber)' : 'transparent',
                letterSpacing: '0.06em',
              }}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-2 py-3 border-t" style={{ borderColor: 'var(--bb-border)' }}>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2.5 px-3 py-2 text-xs font-semibold tracking-wide uppercase transition-colors w-full hover:opacity-80"
          style={{ color: 'var(--bb-gray)', letterSpacing: '0.06em' }}
          onMouseEnter={(e) => e.currentTarget.style.color = 'var(--bb-red)'}
          onMouseLeave={(e) => e.currentTarget.style.color = 'var(--bb-gray)'}
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
