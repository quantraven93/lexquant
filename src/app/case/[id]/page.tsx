"use client";

import { useEffect, useState, use } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { cn, courtTypeBadgeStyle, statusBadgeStyle } from "@/lib/utils";
import { format, differenceInDays } from "date-fns";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface CaseDetail {
  id: string;
  case_title: string;
  court_type: string;
  court_name: string | null;
  case_type: string | null;
  case_number: string;
  case_year: string | null;
  cnr_number: string | null;
  current_status: string | null;
  next_hearing_date: string | null;
  last_order_date: string | null;
  last_order_summary: string | null;
  petitioner: string | null;
  respondent: string | null;
  petitioner_advocate: string | null;
  respondent_advocate: string | null;
  judges: string | null;
  filing_date: string | null;
  registration_date: string | null;
  tags: string[];
  notes: string;
  last_checked_at: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw_data: Record<string, any>;
}

interface CaseUpdate {
  id: string;
  update_type: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

type TabKey = "listings" | "orders" | "history" | "similar" | "ai" | "notes";

interface SimilarHit {
  ikTid: number;
  title: string;
  court: string;
  citation: string | null;
  publishDate: string | null;
  snippet: string;
  distance: number;
  matchedChunks: number;
}

interface SimilarResponse {
  results?: SimilarHit[];
  corpusEmpty?: boolean;
  error?: string;
  details?: string;
}

export default function CaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [caseData, setCaseData] = useState<CaseDetail | null>(null);
  const [updates, setUpdates] = useState<CaseUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshElapsed, setRefreshElapsed] = useState(0);
  const [activeTab, setActiveTab] = useState<TabKey>("listings");
  const [similarResults, setSimilarResults] = useState<SimilarHit[]>([]);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [similarError, setSimilarError] = useState<string | null>(null);
  const [similarCorpusEmpty, setSimilarCorpusEmpty] = useState(false);
  const [similarFetched, setSimilarFetched] = useState(false);
  const [summarizingOrders, setSummarizingOrders] = useState(false);
  const [orderSummariesFetched, setOrderSummariesFetched] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch(`/api/cases/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setCaseData(data.case);
        setUpdates(data.updates || []);
        setNotes(data.case?.notes || "");
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  // Tick a visible elapsed counter while a refresh is in flight. The SC/HC
  // refresh chains a CAPTCHA solve + several court-portal fetches (20-60s);
  // without this the UI looks frozen and reads as broken even when it works.
  useEffect(() => {
    if (!refreshing) {
      setRefreshElapsed(0);
      return;
    }
    const started = Date.now();
    const iv = setInterval(
      () => setRefreshElapsed(Math.floor((Date.now() - started) / 1000)),
      1000,
    );
    return () => clearInterval(iv);
  }, [refreshing]);

  async function saveNotes() {
    setSaving(true);
    await fetch(`/api/cases/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    });
    setSaving(false);
  }

  async function addTag() {
    if (!tagInput.trim() || !caseData) return;
    const newTags = [...(caseData.tags || []), tagInput.trim()];
    await fetch(`/api/cases/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags: newTags }),
    });
    setCaseData({ ...caseData, tags: newTags });
    setTagInput("");
  }

  async function removeTag(tag: string) {
    if (!caseData) return;
    const newTags = caseData.tags.filter((t) => t !== tag);
    await fetch(`/api/cases/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags: newTags }),
    });
    setCaseData({ ...caseData, tags: newTags });
  }

  async function deleteCase() {
    if (!confirm("Remove this case from tracking?")) return;
    await fetch(`/api/cases/${id}`, { method: "DELETE" });
    router.push("/dashboard");
  }

  async function refreshCase() {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/cases/${id}/refresh`, { method: "POST" });
      if (res.ok) {
        const caseRes = await fetch(`/api/cases/${id}`);
        const data = await caseRes.json();
        setCaseData(data.case);
        setUpdates(data.updates || []);
      } else {
        const data = await res.json();
        alert(data.error || "Refresh failed. Try again.");
      }
    } catch {
      alert("Refresh failed.");
    }
    setRefreshing(false);
  }

  async function fetchSimilar() {
    if (!caseData) return;
    // Pick the richest single signal we have: case title first, fall back
    // to the last-order summary, then parties. Anything < 3 chars triggers
    // the API's min-query guard so we bail early instead.
    const query = (
      caseData.case_title?.trim() ||
      caseData.last_order_summary?.trim() ||
      [caseData.petitioner, caseData.respondent].filter(Boolean).join(" vs ") ||
      ""
    ).slice(0, 800);
    if (query.length < 3) {
      setSimilarError("Case has no title or summary to search on.");
      setSimilarFetched(true);
      return;
    }
    setSimilarLoading(true);
    setSimilarError(null);
    try {
      const params = new URLSearchParams({ q: query, limit: "8" });
      const res = await fetch(`/api/search/semantic?${params}`);
      const data = (await res.json()) as SimilarResponse;
      if (!res.ok) {
        setSimilarError(data.error || `Semantic search failed (${res.status})`);
        setSimilarResults([]);
        setSimilarCorpusEmpty(false);
      } else {
        setSimilarResults(data.results || []);
        setSimilarCorpusEmpty(data.corpusEmpty === true);
      }
    } catch (err) {
      setSimilarError(err instanceof Error ? err.message : "Network error");
      setSimilarResults([]);
      setSimilarCorpusEmpty(false);
    } finally {
      setSimilarLoading(false);
      setSimilarFetched(true);
    }
  }

  function selectTab(key: TabKey) {
    setActiveTab(key);
    if (key === "similar" && !similarFetched && !similarLoading) {
      fetchSimilar();
    }
    if (key === "orders" && !orderSummariesFetched && !summarizingOrders) {
      fetchOrderSummaries();
    }
  }

  // Lazily AI-summarise order PDFs the first time the Orders tab is opened.
  // Only fires when some order has a fetchable PDF (SC) without a cached
  // summary; HC orders have no pdfUrl so they are left as-is. Summaries are
  // persisted server-side, so this is a one-time cost per order.
  async function fetchOrderSummaries() {
    if (!caseData) return;
    const ords = (caseData.raw_data?.orders || []) as Array<
      Record<string, string>
    >;
    if (!ords.some((o) => (o.pdfUrl || o.pdfPath) && !o.aiSummary)) {
      setOrderSummariesFetched(true);
      return;
    }
    setSummarizingOrders(true);
    try {
      const res = await fetch(`/api/cases/${id}/order-summaries`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.orders)) {
          setCaseData((prev) =>
            prev
              ? { ...prev, raw_data: { ...prev.raw_data, orders: data.orders } }
              : prev,
          );
        }
      }
    } catch {
      /* non-fatal: order summaries are best-effort */
    } finally {
      setSummarizingOrders(false);
      setOrderSummariesFetched(true);
    }
  }

  async function generateSummary() {
    setSummarizing(true);
    try {
      const res = await fetch(`/api/cases/${id}/summarize`, { method: "POST" });
      const data = await res.json();
      setAiSummary(data.summary || "Failed to generate summary.");
    } catch {
      setAiSummary("Failed to generate summary.");
    }
    setSummarizing(false);
  }

  if (loading)
    return (
      <DashboardShell>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
          }}
        >
          <span className="live-dot" style={{ marginRight: "0.5rem" }} />
          <span
            style={{
              color: "var(--bb-amber)",
              fontSize: "0.75rem",
              letterSpacing: "0.1em",
            }}
          >
            [LOADING CASE...]
          </span>
        </div>
      </DashboardShell>
    );

  if (!caseData)
    return (
      <DashboardShell>
        <div style={{ padding: "2rem", textAlign: "center" }}>
          <p style={{ color: "var(--bb-gray)" }}>Case not found.</p>
          <Link
            href="/dashboard"
            style={{ color: "var(--bb-amber)", fontSize: "0.75rem" }}
          >
            {"< BACK TO DASHBOARD"}
          </Link>
        </div>
      </DashboardShell>
    );

  const hearings = (caseData.raw_data?.hearings || []) as Array<
    Record<string, string>
  >;
  const orders = (caseData.raw_data?.orders || []) as Array<
    Record<string, string>
  >;
  const nextHearingDays = caseData.next_hearing_date
    ? differenceInDays(new Date(caseData.next_hearing_date), new Date())
    : null;

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: "listings", label: "LISTINGS", count: hearings.length },
    { key: "orders", label: "ORDERS", count: orders.length },
    { key: "history", label: "HISTORY", count: updates.length },
    { key: "similar", label: "SIMILAR JUDGMENTS" },
    { key: "ai", label: "AI ANALYSIS" },
    { key: "notes", label: "NOTES" },
  ];

  return (
    <DashboardShell>
      <div
        style={{
          padding: "0.75rem",
          display: "flex",
          flexDirection: "column",
          gap: "1px",
          background: "var(--bb-border)",
        }}
      >
        {/* Header */}
        <div className="bb-panel" style={{ padding: "0.75rem" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: "0.5rem",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <Link
                href="/dashboard"
                style={{
                  color: "var(--bb-amber)",
                  fontSize: "0.65rem",
                  letterSpacing: "0.08em",
                }}
              >
                {"< BACK"}
              </Link>
              <h1
                style={{
                  fontSize: "1rem",
                  fontWeight: 700,
                  color: "var(--bb-amber)",
                  marginTop: "0.3rem",
                  lineHeight: 1.3,
                }}
              >
                {caseData.case_title ||
                  `${caseData.case_number}/${caseData.case_year}`}
              </h1>
              <div
                style={{
                  display: "flex",
                  gap: "0.4rem",
                  alignItems: "center",
                  marginTop: "0.3rem",
                  flexWrap: "wrap",
                }}
              >
                <span style={courtTypeBadgeStyle(caseData.court_type)}>
                  {caseData.court_type}
                </span>
                <span style={statusBadgeStyle(caseData.current_status)}>
                  {caseData.current_status || "Unknown"}
                </span>
                {caseData.cnr_number && (
                  <span
                    style={{ fontSize: "0.58rem", color: "var(--bb-gray)" }}
                  >
                    CNR: {caseData.cnr_number}
                  </span>
                )}
                {caseData.court_name && (
                  <span
                    style={{ fontSize: "0.58rem", color: "var(--bb-gray)" }}
                  >
                    {caseData.court_name}
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: "0.3rem", flexShrink: 0 }}>
              <button
                onClick={refreshCase}
                disabled={refreshing}
                className="bb-btn bb-btn-primary"
                style={{
                  padding: "0.3rem 0.6rem",
                  fontSize: "0.6rem",
                  opacity: refreshing ? 0.6 : 1,
                }}
              >
                {refreshing
                  ? `[REFRESHING ${refreshElapsed}s...]`
                  : "[REFRESH]"}
              </button>
              <Link
                href={`/case/${id}/chronology`}
                target="_blank"
                rel="noopener noreferrer"
                className="bb-btn bb-btn-secondary"
                style={{
                  padding: "0.3rem 0.6rem",
                  fontSize: "0.6rem",
                  textDecoration: "none",
                  display: "inline-block",
                }}
                title="Open print-friendly chronology in new tab"
              >
                [CHRONO]
              </Link>
              <button
                onClick={deleteCase}
                className="bb-btn bb-btn-danger"
                style={{ padding: "0.3rem 0.6rem", fontSize: "0.6rem" }}
              >
                [DEL]
              </button>
            </div>
          </div>
        </div>

        {/* Case Info Card — 2 columns */}
        <div className="bb-panel">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr",
              gap: "1px",
              background: "var(--bb-border)",
            }}
          >
            {/* Left: Case details */}
            <div
              style={{
                background: "var(--bb-panel)",
                padding: "0.6rem 0.75rem",
              }}
            >
              <div
                className="bb-kv"
                style={{ borderBottom: "none", paddingBottom: "0.15rem" }}
              >
                <span className="bb-kv-label">CASE NO</span>
                <span className="bb-kv-value">
                  {caseData.case_type ? `${caseData.case_type} ` : ""}
                  {caseData.case_number}/{caseData.case_year}
                </span>
              </div>
              {caseData.filing_date && (
                <div
                  className="bb-kv"
                  style={{ borderBottom: "none", paddingBottom: "0.15rem" }}
                >
                  <span className="bb-kv-label">FILING DATE</span>
                  <span className="bb-kv-value">
                    {format(new Date(caseData.filing_date), "dd MMM yyyy")}
                  </span>
                </div>
              )}
              <div
                className="bb-kv"
                style={{ borderBottom: "none", paddingBottom: "0.15rem" }}
              >
                <span className="bb-kv-label">STAGE</span>
                <span className="bb-kv-value">
                  {caseData.current_status || "—"}
                </span>
              </div>
              {caseData.last_order_date && (
                <div className="bb-kv" style={{ borderBottom: "none" }}>
                  <span className="bb-kv-label">LAST ORDER</span>
                  <span className="bb-kv-value">
                    {format(new Date(caseData.last_order_date), "dd MMM yyyy")}
                  </span>
                </div>
              )}
            </div>

            {/* Right: Next Hearing (prominent) */}
            <div
              style={{
                background: "var(--bb-panel)",
                padding: "0.6rem 0.75rem",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
              }}
            >
              <span className="bb-kv-label" style={{ marginBottom: "0.3rem" }}>
                NEXT HEARING
              </span>
              {caseData.next_hearing_date ? (
                <>
                  <span
                    style={{
                      fontSize: "1.1rem",
                      fontWeight: 700,
                      color:
                        nextHearingDays !== null && nextHearingDays <= 7
                          ? "var(--bb-amber)"
                          : nextHearingDays !== null && nextHearingDays < 0
                            ? "var(--bb-red)"
                            : "var(--bb-white)",
                    }}
                  >
                    {format(new Date(caseData.next_hearing_date), "dd-MM-yyyy")}
                  </span>
                  <span
                    style={{
                      fontSize: "0.6rem",
                      color: "var(--bb-gray)",
                      marginTop: "0.15rem",
                    }}
                  >
                    {format(new Date(caseData.next_hearing_date), "EEEE")}
                  </span>
                </>
              ) : (
                <span style={{ fontSize: "0.8rem", color: "var(--bb-gray)" }}>
                  Not scheduled
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 3-Column Cards: Advocate / Hearing Advocate / Judges */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: "1px",
            background: "var(--bb-border)",
          }}
        >
          {/* Advocate */}
          <div className="bb-panel" style={{ border: "none" }}>
            <div
              className="bb-panel-header"
              style={{ padding: "0.3rem 0.6rem" }}
            >
              <span className="bb-panel-title" style={{ fontSize: "0.6rem" }}>
                ADVOCATE
              </span>
              <span className="bb-panel-tag" style={{ fontSize: "0.5rem" }}>
                {(caseData.petitioner_advocate ? 1 : 0) +
                  (caseData.respondent_advocate ? 1 : 0)}
              </span>
            </div>
            <div style={{ padding: "0.5rem 0.6rem", fontSize: "0.72rem" }}>
              <div style={{ color: "var(--bb-white)" }}>
                {caseData.petitioner_advocate || caseData.petitioner || "—"}
              </div>
              <div
                style={{
                  color: "var(--bb-gray)",
                  fontSize: "0.6rem",
                  margin: "0.2rem 0",
                }}
              >
                Vs.
              </div>
              <div style={{ color: "var(--bb-white)" }}>
                {caseData.respondent_advocate || caseData.respondent || "—"}
              </div>
            </div>
          </div>

          {/* Parties */}
          <div className="bb-panel" style={{ border: "none" }}>
            <div
              className="bb-panel-header"
              style={{ padding: "0.3rem 0.6rem" }}
            >
              <span className="bb-panel-title" style={{ fontSize: "0.6rem" }}>
                PARTIES
              </span>
              <span className="bb-panel-tag" style={{ fontSize: "0.5rem" }}>
                2
              </span>
            </div>
            <div style={{ padding: "0.5rem 0.6rem", fontSize: "0.72rem" }}>
              <div style={{ color: "var(--bb-white)" }}>
                {caseData.petitioner || "—"}
              </div>
              <div
                style={{
                  color: "var(--bb-gray)",
                  fontSize: "0.6rem",
                  margin: "0.2rem 0",
                }}
              >
                Vs.
              </div>
              <div style={{ color: "var(--bb-white)" }}>
                {caseData.respondent || "—"}
              </div>
            </div>
          </div>

          {/* Hearing Judges */}
          <div className="bb-panel" style={{ border: "none" }}>
            <div
              className="bb-panel-header"
              style={{ padding: "0.3rem 0.6rem" }}
            >
              <span className="bb-panel-title" style={{ fontSize: "0.6rem" }}>
                HEARING JUDGES
              </span>
              <span className="bb-panel-tag" style={{ fontSize: "0.5rem" }}>
                {caseData.judges ? 1 : 0}
              </span>
            </div>
            <div
              style={{
                padding: "0.5rem 0.6rem",
                fontSize: "0.72rem",
                color: "var(--bb-white)",
              }}
            >
              {caseData.judges || "Not available"}
            </div>
          </div>
        </div>

        {/* Tabbed Section */}
        <div className="bb-panel">
          <div className="bb-tabs">
            {tabs.map((t) => (
              <button
                key={t.key}
                className={cn("bb-tab", activeTab === t.key && "active")}
                onClick={() => selectTab(t.key)}
              >
                {t.label}
                {t.count !== undefined ? ` (${t.count})` : ""}
              </button>
            ))}
          </div>

          {/* Tab: Listings */}
          {activeTab === "listings" && (
            <div>
              {hearings.length === 0 ? (
                <div
                  style={{
                    padding: "2rem",
                    textAlign: "center",
                    color: "var(--bb-gray)",
                    fontSize: "0.75rem",
                  }}
                >
                  {refreshing
                    ? `Fetching listings from the court... ${refreshElapsed}s (this can take up to a minute)`
                    : "No listing data available. Click [REFRESH] to fetch."}
                </div>
              ) : (
                <table className="bb-table">
                  <thead>
                    <tr>
                      <th>DATE</th>
                      <th>PURPOSE</th>
                      <th>REMARKS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hearings
                      .filter((h) => !String(h.date || "").includes("CL Date"))
                      .map((h, i) => (
                        <tr key={i}>
                          <td
                            style={{
                              whiteSpace: "nowrap",
                              color: "var(--bb-amber)",
                            }}
                          >
                            {String(h.date || "")}
                          </td>
                          <td style={{ fontSize: "0.72rem" }}>
                            {String(h.purpose || "")}
                          </td>
                          <td
                            style={{
                              fontSize: "0.72rem",
                              color: String(h.remarks || "").includes(
                                "Disposed",
                              )
                                ? "var(--bb-green)"
                                : String(h.remarks || "").includes(
                                      "Adjourned",
                                    ) ||
                                    String(h.remarks || "").includes(
                                      "Not taken",
                                    )
                                  ? "var(--bb-red)"
                                  : "var(--bb-gray)",
                            }}
                          >
                            {String(h.remarks || "—")}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Tab: Orders */}
          {activeTab === "orders" && (
            <div>
              {orders.length === 0 ? (
                <div
                  style={{
                    padding: "2rem",
                    textAlign: "center",
                    color: "var(--bb-gray)",
                    fontSize: "0.75rem",
                  }}
                >
                  {refreshing
                    ? `Fetching orders from the court... ${refreshElapsed}s (this can take up to a minute)`
                    : "No orders available. Click [REFRESH] to fetch."}
                </div>
              ) : (
                <table className="bb-table">
                  <thead>
                    <tr>
                      <th>DATE</th>
                      <th>TYPE</th>
                      <th>AI SUMMARY</th>
                      <th>DOCUMENT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o, i) => (
                      <tr key={i}>
                        <td
                          style={{
                            whiteSpace: "nowrap",
                            color: "var(--bb-amber)",
                          }}
                        >
                          {String(o.date || "")}
                        </td>
                        <td style={{ fontSize: "0.72rem" }}>
                          {String(o.orderType || "")}
                        </td>
                        <td
                          style={{
                            fontSize: "0.72rem",
                            color: "var(--bb-gray)",
                            maxWidth: "440px",
                            lineHeight: 1.35,
                          }}
                        >
                          {o.aiSummary
                            ? String(o.aiSummary)
                            : o.pdfUrl || o.pdfPath
                              ? summarizingOrders
                                ? "Summarizing..."
                                : "—"
                              : "—"}
                        </td>
                        <td>
                          {o.pdfUrl || o.pdfPath ? (
                            <a
                              href={
                                o.pdfUrl
                                  ? String(o.pdfUrl)
                                  : `/api/cases/${id}/order-pdf?n=${i}`
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                              className="bb-btn bb-btn-secondary"
                              style={{
                                padding: "0.15rem 0.4rem",
                                fontSize: "0.55rem",
                              }}
                            >
                              [VIEW PDF]
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Tab: History */}
          {activeTab === "history" && (
            <div>
              {updates.length === 0 ? (
                <div
                  style={{
                    padding: "2rem",
                    textAlign: "center",
                    color: "var(--bb-gray)",
                    fontSize: "0.75rem",
                  }}
                >
                  No updates yet.
                </div>
              ) : (
                <div
                  style={{
                    padding: "0.5rem 0.75rem",
                    fontFamily: "var(--bb-font)",
                    fontSize: "0.72rem",
                  }}
                >
                  {updates.map((u) => (
                    <div
                      key={u.id}
                      style={{
                        padding: "0.3rem 0",
                        borderBottom: "1px solid rgba(26,32,48,0.3)",
                      }}
                    >
                      <span
                        style={{
                          color: "var(--bb-amber)",
                          marginRight: "0.5rem",
                        }}
                      >
                        {">"}
                      </span>
                      <span
                        style={{
                          color: "var(--bb-gray)",
                          marginRight: "0.5rem",
                        }}
                      >
                        {format(new Date(u.created_at), "dd MMM yyyy HH:mm")}
                      </span>
                      <span
                        style={{
                          color: "var(--bb-white)",
                          marginRight: "0.5rem",
                        }}
                      >
                        {u.update_type.replace(/_/g, " ").toUpperCase()}
                      </span>
                      {u.old_value && (
                        <span
                          style={{
                            color: "var(--bb-red)",
                            marginRight: "0.3rem",
                          }}
                        >
                          {u.old_value}
                        </span>
                      )}
                      {u.old_value && u.new_value && (
                        <span
                          style={{
                            color: "var(--bb-gray)",
                            marginRight: "0.3rem",
                          }}
                        >
                          →
                        </span>
                      )}
                      {u.new_value && (
                        <span style={{ color: "var(--bb-green)" }}>
                          {u.new_value}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab: Similar Judgments — semantic search over the corpus */}
          {activeTab === "similar" && (
            <div style={{ padding: "0.75rem" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "0.6rem",
                }}
              >
                <span
                  style={{
                    fontSize: "0.62rem",
                    color: "var(--bb-gray)",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  Matched on case title via voyage-law-2 · cosine kNN
                </span>
                <button
                  type="button"
                  onClick={fetchSimilar}
                  disabled={similarLoading}
                  className="bb-btn bb-btn-primary"
                  style={{
                    padding: "0.25rem 0.5rem",
                    fontSize: "0.6rem",
                    opacity: similarLoading ? 0.6 : 1,
                  }}
                >
                  {similarLoading
                    ? "[SEARCHING...]"
                    : similarFetched
                      ? "[RE-RUN]"
                      : "[SEARCH]"}
                </button>
              </div>

              {similarLoading && (
                <div
                  style={{
                    padding: "1.5rem",
                    textAlign: "center",
                    color: "var(--bb-amber)",
                    fontFamily: "var(--bb-font, monospace)",
                    fontSize: "0.7rem",
                    letterSpacing: "0.1em",
                  }}
                >
                  [EMBEDDING QUERY · MATCHING CHUNKS...]
                </div>
              )}

              {!similarLoading && similarError && (
                <div
                  style={{
                    padding: "1rem",
                    color: "var(--bb-red)",
                    fontFamily: "var(--bb-font, monospace)",
                    fontSize: "0.7rem",
                  }}
                >
                  ERROR: {similarError}
                </div>
              )}

              {!similarLoading &&
                !similarError &&
                similarFetched &&
                similarCorpusEmpty && (
                  <div
                    style={{
                      padding: "1.5rem",
                      textAlign: "center",
                      color: "var(--bb-amber)",
                      fontFamily: "var(--bb-font, monospace)",
                      fontSize: "0.7rem",
                      letterSpacing: "0.06em",
                    }}
                  >
                    [CORPUS NOT YET POPULATED]
                    <div
                      style={{
                        marginTop: "0.5rem",
                        color: "var(--bb-gray)",
                        fontSize: "0.65rem",
                        letterSpacing: "0.02em",
                        textTransform: "none",
                      }}
                    >
                      No judgment chunks have been embedded yet. Run the
                      backfill script or browse the daily judgments to populate
                      the semantic index.
                    </div>
                  </div>
                )}

              {!similarLoading &&
                !similarError &&
                similarFetched &&
                !similarCorpusEmpty &&
                similarResults.length === 0 && (
                  <div
                    style={{
                      padding: "1.5rem",
                      textAlign: "center",
                      color: "var(--bb-gray)",
                      fontSize: "0.72rem",
                    }}
                  >
                    No similar judgments matched on this case&apos;s title.
                  </div>
                )}

              {!similarLoading && similarResults.length > 0 && (
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {similarResults.map((hit) => {
                    const pct = Math.max(
                      0,
                      Math.min(100, Math.round(((2 - hit.distance) / 2) * 100)),
                    );
                    return (
                      <li
                        key={hit.ikTid}
                        style={{
                          padding: "0.55rem 0",
                          borderBottom: "1px solid rgba(26,32,48,0.3)",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: "0.75rem",
                            marginBottom: "0.25rem",
                          }}
                        >
                          <Link
                            href={`/research/${hit.ikTid}`}
                            style={{
                              color: "var(--bb-white)",
                              fontFamily:
                                "var(--bb-font-serif, Georgia, serif)",
                              fontSize: "0.82rem",
                              textDecoration: "none",
                              lineHeight: 1.3,
                            }}
                          >
                            {hit.title}
                          </Link>
                          <span
                            style={{
                              fontFamily: "var(--bb-font, monospace)",
                              fontSize: "0.6rem",
                              color: "var(--bb-amber)",
                              whiteSpace: "nowrap",
                              letterSpacing: "0.06em",
                            }}
                          >
                            {pct}% match
                            {hit.matchedChunks > 1
                              ? ` · ${hit.matchedChunks} hits`
                              : ""}
                          </span>
                        </div>
                        <div
                          style={{
                            fontFamily: "var(--bb-font, monospace)",
                            fontSize: "0.58rem",
                            color: "var(--bb-gray)",
                            letterSpacing: "0.06em",
                            textTransform: "uppercase",
                            marginBottom: "0.35rem",
                          }}
                        >
                          {hit.court}
                          {hit.publishDate ? ` · ${hit.publishDate}` : ""}
                          {hit.citation ? ` · ${hit.citation}` : ""}
                        </div>
                        <div
                          style={{
                            fontFamily: "var(--bb-font-serif, Georgia, serif)",
                            fontSize: "0.74rem",
                            lineHeight: 1.5,
                            color: "var(--bb-white)",
                            borderLeft: "2px solid var(--bb-amber-dim)",
                            paddingLeft: "0.6rem",
                          }}
                        >
                          {hit.snippet}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {/* Tab: AI Analysis */}
          {activeTab === "ai" && (
            <div style={{ padding: "0.75rem" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "0.5rem",
                }}
              >
                <span
                  style={{
                    fontSize: "0.68rem",
                    color: "var(--bb-amber)",
                    fontWeight: 600,
                  }}
                >
                  AI CASE ANALYSIS
                </span>
                <button
                  onClick={generateSummary}
                  disabled={summarizing}
                  className="bb-btn bb-btn-primary"
                  style={{
                    padding: "0.25rem 0.5rem",
                    fontSize: "0.6rem",
                    opacity: summarizing ? 0.6 : 1,
                  }}
                >
                  {summarizing
                    ? "[GENERATING...]"
                    : aiSummary
                      ? "[REGENERATE]"
                      : "[GENERATE SUMMARY]"}
                </button>
              </div>
              {aiSummary ? (
                <div
                  style={{
                    fontSize: "0.78rem",
                    color: "var(--bb-white)",
                    lineHeight: 1.6,
                    whiteSpace: "pre-line",
                  }}
                >
                  {aiSummary}
                </div>
              ) : (
                <div style={{ fontSize: "0.72rem", color: "var(--bb-gray)" }}>
                  Click Generate Summary to get an AI analysis of this case.
                </div>
              )}
            </div>
          )}

          {/* Tab: Notes & Tags */}
          {activeTab === "notes" && (
            <div style={{ padding: "0.75rem" }}>
              {/* Tags */}
              <div style={{ marginBottom: "1rem" }}>
                <span
                  style={{
                    fontSize: "0.6rem",
                    color: "var(--bb-amber)",
                    fontWeight: 600,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  CLASSIFICATION
                </span>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "0.3rem",
                    marginTop: "0.4rem",
                    marginBottom: "0.4rem",
                  }}
                >
                  {(caseData.tags || []).map((tag) => (
                    <span
                      key={tag}
                      style={{
                        fontSize: "0.6rem",
                        padding: "0.15rem 0.4rem",
                        border: "1px solid var(--bb-amber)",
                        color: "var(--bb-amber)",
                      }}
                    >
                      {tag}{" "}
                      <button
                        onClick={() => removeTag(tag)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--bb-gray)",
                          cursor: "pointer",
                          marginLeft: "0.2rem",
                        }}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <div style={{ display: "flex", gap: "0.3rem" }}>
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === "Enter" && (e.preventDefault(), addTag())
                    }
                    placeholder="Add tag..."
                    style={{ flex: 1 }}
                  />
                  <button
                    onClick={addTag}
                    className="bb-btn bb-btn-primary"
                    style={{ padding: "0.3rem 0.5rem", fontSize: "0.6rem" }}
                  >
                    [ADD]
                  </button>
                </div>
              </div>

              {/* Notes */}
              <div>
                <span
                  style={{
                    fontSize: "0.6rem",
                    color: "var(--bb-amber)",
                    fontWeight: 600,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  NOTES
                </span>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={5}
                  placeholder="Add notes about this case..."
                  style={{
                    width: "100%",
                    marginTop: "0.4rem",
                    resize: "vertical",
                  }}
                />
                <button
                  onClick={saveNotes}
                  disabled={saving}
                  className="bb-btn bb-btn-primary"
                  style={{
                    marginTop: "0.3rem",
                    padding: "0.3rem 0.6rem",
                    fontSize: "0.6rem",
                    opacity: saving ? 0.6 : 1,
                  }}
                >
                  {saving ? "[SAVING...]" : "[SAVE]"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Last checked */}
        {caseData.last_checked_at && (
          <div
            style={{
              textAlign: "center",
              padding: "0.5rem",
              fontSize: "0.58rem",
              color: "var(--bb-gray)",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            LAST CHECKED:{" "}
            {format(new Date(caseData.last_checked_at), "dd MMM yyyy, HH:mm")}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
