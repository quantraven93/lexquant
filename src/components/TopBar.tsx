"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";

interface SearchHit {
  kind: "case" | "judgment" | "news" | "judge";
  label: string;
  sub?: string;
  href: string;
}

interface SearchResponse {
  groups?: Record<string, SearchHit[]>;
}

const GROUP_ORDER = ["Cases", "Judgments", "Judges", "News"] as const;

function isMac(): boolean {
  if (typeof navigator === "undefined") return true;
  return /Mac|iPhone|iPad/.test(navigator.platform);
}

function pathToCrumbs(pathname: string): string {
  if (!pathname || pathname === "/") return "HOME";
  const parts = pathname.split("/").filter(Boolean);
  return [
    "HOME",
    ...parts.map((p) => p.replace(/\[|\]/g, "").toUpperCase()),
  ].join(" / ");
}

export function TopBar() {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetchFailed, setFetchFailed] = useState(false);
  const [groups, setGroups] = useState<Record<string, SearchHit[]>>({});
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);

  // Flatten groups in render order so keyboard nav works.
  const flat: Array<{ group: string; hit: SearchHit }> = useMemo(() => {
    const out: Array<{ group: string; hit: SearchHit }> = [];
    out.push({
      group: "Ask AI",
      hit: {
        kind: "case",
        label: q ? `Ask AI: ${q}` : "Ask AI",
        sub: "Open the AI research console",
        href: q ? `/search?q=${encodeURIComponent(q)}` : "/search",
      },
    });
    for (const name of GROUP_ORDER) {
      const list = groups[name] || [];
      for (const hit of list) {
        out.push({ group: name, hit });
      }
    }
    return out;
  }, [groups, q]);

  // ⌘K / Ctrl+K to focus the input from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = isMac() ? e.metaKey : e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      } else if (e.key === "Escape") {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Debounced fetch.
  useEffect(() => {
    if (!q || q.trim().length < 2) {
      setGroups({});
      return;
    }
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search/global?q=${encodeURIComponent(q)}`);
        if (!r.ok) {
          setGroups({});
          setFetchFailed(true);
        } else {
          const data = (await r.json()) as SearchResponse;
          setGroups(data.groups || {});
          setFetchFailed(false);
        }
      } catch {
        setGroups({});
        setFetchFailed(true);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [q]);

  // Click-outside closes.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t)) return;
      if (inputRef.current?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  const selectIndex = useCallback(
    (idx: number) => {
      const item = flat[idx];
      if (!item) return;
      const href = item.hit.href;
      setOpen(false);
      setQ("");
      if (href.startsWith("http")) {
        window.open(href, "_blank", "noopener,noreferrer");
      } else {
        router.push(href);
      }
    },
    [flat, router],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, flat.length - 1));
      setOpen(true);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
      setOpen(true);
    } else if (e.key === "Enter") {
      e.preventDefault();
      selectIndex(activeIdx);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  useEffect(() => {
    setActiveIdx(0);
  }, [q]);

  const showPop = open && q.trim().length >= 2;

  return (
    <div className="bb-topbar">
      <div className="bb-topbar-crumbs">{pathToCrumbs(pathname)}</div>

      <div className="bb-topbar-search-slot">
        <div className="bb-search-wrap">
          <input
            ref={inputRef}
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder="search cases · statutes · judges · ask AI"
            className="bb-search-input"
            aria-label="Global search"
          />
          <span className="bb-search-hint">
            {loading ? "…" : isMac() ? "⌘K" : "Ctrl K"}
          </span>

          {showPop ? (
            <div ref={popRef} className="bb-search-pop">
              {flat.length === 0 ? (
                <div className="bb-search-empty">No matches.</div>
              ) : (
                (() => {
                  let cursor = 0;
                  return (
                    <>
                      {fetchFailed ? (
                        <div className="bb-search-empty">
                          search backend unreachable — keep typing to retry
                        </div>
                      ) : null}
                      {/* Ask AI is always first */}
                      <div className="bb-search-section">
                        <div className="bb-search-section-label">Ask AI</div>
                        <button
                          type="button"
                          className={`bb-search-row ${cursor === activeIdx ? "is-active" : ""}`}
                          onMouseEnter={() => setActiveIdx(0)}
                          onClick={() => selectIndex(0)}
                        >
                          <span className="bb-search-row-label">
                            Ask AI: {q}
                          </span>
                          <span className="bb-search-row-sub">
                            Open AI research console
                          </span>
                        </button>
                      </div>
                      {GROUP_ORDER.map((name) => {
                        const list = groups[name] || [];
                        if (!list.length) return null;
                        cursor += 1;
                        // Reserve a section block. Each row consumes one cursor.
                        const startIdx = cursor;
                        cursor += list.length - 1;
                        return (
                          <div key={name} className="bb-search-section">
                            <div className="bb-search-section-label">
                              {name}
                            </div>
                            {list.map((hit, i) => {
                              const idx = startIdx + i;
                              return (
                                <button
                                  key={`${name}-${i}`}
                                  type="button"
                                  className={`bb-search-row ${idx === activeIdx ? "is-active" : ""}`}
                                  onMouseEnter={() => setActiveIdx(idx)}
                                  onClick={() => selectIndex(idx)}
                                >
                                  <span className="bb-search-row-label">
                                    {hit.label}
                                  </span>
                                  {hit.sub ? (
                                    <span className="bb-search-row-sub">
                                      {hit.sub}
                                    </span>
                                  ) : null}
                                </button>
                              );
                            })}
                          </div>
                        );
                      })}
                    </>
                  );
                })()
              )}
            </div>
          ) : null}
        </div>
      </div>

      <div className="bb-topbar-actions">
        <span className="bb-topbar-action" title="Notifications">
          ◯
        </span>
        <span className="bb-topbar-action" title="Bookmarks">
          ☆
        </span>
      </div>
    </div>
  );
}
