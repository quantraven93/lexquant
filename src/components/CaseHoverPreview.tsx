"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface HoverCaseData {
  id: string;
  case_title: string | null;
  case_type: string | null;
  case_number: string | null;
  case_year: string | null;
  court_type: string | null;
  court_name: string | null;
  current_status: string | null;
  next_hearing_date: string | null;
  petitioner: string | null;
  respondent: string | null;
  judges?: string | null;
  last_order_summary?: string | null;
  tags?: string[] | null;
}

interface PreviewPosition {
  x: number;
  y: number;
}

interface ActiveState {
  data: HoverCaseData;
  pos: PreviewPosition;
}

const PREVIEW_WIDTH = 360;
const PREVIEW_GAP = 12;
const ENTER_DELAY_MS = 200;

/**
 * useCaseHover — returns the props you spread onto each row container
 * plus the floating preview element to render once at the page level.
 *
 * Usage:
 *   const { rowProps, preview } = useCaseHover();
 *   ...
 *   <li {...rowProps(caseData)}>...</li>
 *   {preview}
 */
export function useCaseHover() {
  const [active, setActive] = useState<ActiveState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMouseRef = useRef<PreviewPosition>({ x: 0, y: 0 });

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const place = useCallback((mouse: PreviewPosition): PreviewPosition => {
    if (typeof window === "undefined") return mouse;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let x = mouse.x + PREVIEW_GAP;
    if (x + PREVIEW_WIDTH > vw - 12) {
      x = Math.max(12, mouse.x - PREVIEW_WIDTH - PREVIEW_GAP);
    }
    let y = mouse.y;
    // Vertical: keep within viewport; preview is up to ~280px tall.
    const guessHeight = 280;
    if (y + guessHeight > vh - 12) {
      y = Math.max(12, vh - guessHeight - 12);
    }
    return { x, y };
  }, []);

  const onEnter = useCallback(
    (data: HoverCaseData) => (e: React.MouseEvent) => {
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
      clearTimer();
      const mouse = { ...lastMouseRef.current };
      timerRef.current = setTimeout(() => {
        setActive({ data, pos: place(mouse) });
      }, ENTER_DELAY_MS);
    },
    [place],
  );

  const onMove = useCallback((e: React.MouseEvent) => {
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onLeave = useCallback(() => {
    clearTimer();
    setActive(null);
  }, []);

  useEffect(() => () => clearTimer(), []);

  const rowProps = useCallback(
    (data: HoverCaseData) => ({
      onMouseEnter: onEnter(data),
      onMouseMove: onMove,
      onMouseLeave: onLeave,
    }),
    [onEnter, onMove, onLeave],
  );

  return {
    rowProps,
    preview: active ? (
      <PreviewCard data={active.data} pos={active.pos} />
    ) : null,
  };
}

function PreviewCard({
  data,
  pos,
}: {
  data: HoverCaseData;
  pos: PreviewPosition;
}) {
  const label =
    data.case_title ||
    `${data.case_type || ""} ${data.case_number || ""}/${data.case_year || ""}`.trim();

  const bench = data.judges
    ? data.judges
        .split(/[,;|]/)
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  return (
    <div
      className="bb-preview"
      style={{
        left: pos.x,
        top: pos.y,
      }}
      role="tooltip"
      aria-live="polite"
    >
      <div className="bb-preview-title">{label}</div>
      <div className="bb-preview-meta">
        {[
          data.case_type
            ? `${data.case_type} ${data.case_number || ""}/${data.case_year || ""}`
            : null,
          data.court_name || data.court_type,
          bench.length ? `Bench: ${bench.slice(0, 2).join(", ")}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </div>
      {data.petitioner || data.respondent ? (
        <div className="bb-preview-parties">
          {[data.petitioner, data.respondent].filter(Boolean).join(" vs ")}
        </div>
      ) : null}
      {data.last_order_summary ? (
        <div className="bb-preview-summary">{data.last_order_summary}</div>
      ) : null}
      <div className="bb-preview-footer">
        {data.current_status ? (
          <span className="bb-preview-chip">{data.current_status}</span>
        ) : null}
        {data.next_hearing_date ? (
          <span className="bb-preview-chip">
            Next:{" "}
            {new Date(data.next_hearing_date).toLocaleDateString("en-IN", {
              day: "2-digit",
              month: "short",
            })}
          </span>
        ) : null}
        {(data.tags || []).slice(0, 3).map((t) => (
          <span key={t} className="bb-preview-chip">
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}
