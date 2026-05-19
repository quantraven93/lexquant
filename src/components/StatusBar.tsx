"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Persistent 22px status bar at the bottom of the app shell.
 * Reads route from `usePathname` and shows fixed mode/DB/model badges.
 */
export function StatusBar() {
  const pathname = usePathname();
  const [time, setTime] = useState<string>("--:--:--");

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      const ss = String(d.getSeconds()).padStart(2, "0");
      setTime(`${hh}:${mm}:${ss}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="bb-statusbar">
      <div className="bb-status-cell">
        <span className="bb-status-label">MODE</span>
        <span className="bb-status-val">RESEARCH</span>
      </div>
      <div className="bb-status-cell">
        <span className="bb-status-label">ROUTE</span>
        <span className="bb-status-val">{pathname || "/"}</span>
      </div>
      <div className="bb-status-cell">
        <span className="bb-status-label">DB</span>
        <span className="live-dot" />
        <span className="bb-status-val">SUPABASE</span>
      </div>
      <div className="bb-status-cell">
        <span className="bb-status-label">CLAUDE</span>
        <span className="bb-status-val">HAIKU-4.5</span>
      </div>
      <div className="bb-status-cell" style={{ marginLeft: "auto" }}>
        <span className="bb-status-label">IST</span>
        <span className="bb-status-val">{time}</span>
      </div>
    </div>
  );
}
