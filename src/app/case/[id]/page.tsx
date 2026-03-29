"use client";

import { useEffect, useState, use } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { cn, COURT_TYPE_COLORS, STATUS_COLORS } from "@/lib/utils";
import { format, differenceInDays } from "date-fns";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface CaseDetail {
  id: string;
  case_title: string;
  court_type: string;
  court_name: string | null;
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

type TabKey = "listings" | "orders" | "history" | "ai" | "notes";

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
  const [activeTab, setActiveTab] = useState<TabKey>("listings");
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

  async function saveNotes() {
    setSaving(true);
    await fetch(`/api/cases/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notes }) });
    setSaving(false);
  }

  async function addTag() {
    if (!tagInput.trim() || !caseData) return;
    const newTags = [...(caseData.tags || []), tagInput.trim()];
    await fetch(`/api/cases/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tags: newTags }) });
    setCaseData({ ...caseData, tags: newTags });
    setTagInput("");
  }

  async function removeTag(tag: string) {
    if (!caseData) return;
    const newTags = caseData.tags.filter((t) => t !== tag);
    await fetch(`/api/cases/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tags: newTags }) });
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
    } catch { alert("Refresh failed."); }
    setRefreshing(false);
  }

  async function generateSummary() {
    setSummarizing(true);
    try {
      const res = await fetch(`/api/cases/${id}/summarize`, { method: "POST" });
      const data = await res.json();
      setAiSummary(data.summary || "Failed to generate summary.");
    } catch { setAiSummary("Failed to generate summary."); }
    setSummarizing(false);
  }

  if (loading) return (
    <DashboardShell>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <span className="live-dot" style={{ marginRight: "0.5rem" }} />
        <span style={{ color: "var(--bb-amber)", fontSize: "0.75rem", letterSpacing: "0.1em" }}>[LOADING CASE...]</span>
      </div>
    </DashboardShell>
  );

  if (!caseData) return (
    <DashboardShell>
      <div style={{ padding: "2rem", textAlign: "center" }}>
        <p style={{ color: "var(--bb-gray)" }}>Case not found.</p>
        <Link href="/dashboard" style={{ color: "var(--bb-amber)", fontSize: "0.75rem" }}>{"< BACK TO DASHBOARD"}</Link>
      </div>
    </DashboardShell>
  );

  const hearings = (caseData.raw_data?.hearings || []) as Array<Record<string, string>>;
  const orders = (caseData.raw_data?.orders || []) as Array<Record<string, string>>;
  const nextHearingDays = caseData.next_hearing_date ? differenceInDays(new Date(caseData.next_hearing_date), new Date()) : null;

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: "listings", label: "LISTINGS", count: hearings.length },
    { key: "orders", label: "ORDERS", count: orders.length },
    { key: "history", label: "HISTORY", count: updates.length },
    { key: "ai", label: "AI ANALYSIS" },
    { key: "notes", label: "NOTES" },
  ];

  return (
    <DashboardShell>
      <div style={{ padding: "0.75rem", display: "flex", flexDirection: "column", gap: "1px", background: "var(--bb-border)" }}>

        {/* Header */}
        <div className="bb-panel" style={{ padding: "0.75rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Link href="/dashboard" style={{ color: "var(--bb-amber)", fontSize: "0.65rem", letterSpacing: "0.08em" }}>{"< BACK"}</Link>
              <h1 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--bb-amber)", marginTop: "0.3rem", lineHeight: 1.3 }}>
                {caseData.case_title || `${caseData.case_number}/${caseData.case_year}`}
              </h1>
              <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", marginTop: "0.3rem", flexWrap: "wrap" }}>
                <span className={cn("px-1.5 py-0.5 text-xs font-semibold", COURT_TYPE_COLORS[caseData.court_type])} style={{ fontSize: "0.6rem" }}>{caseData.court_type}</span>
                <span className={cn("px-1.5 py-0.5 text-xs font-semibold", STATUS_COLORS[caseData.current_status || "Unknown"])} style={{ fontSize: "0.6rem" }}>{caseData.current_status || "Unknown"}</span>
                {caseData.cnr_number && <span style={{ fontSize: "0.58rem", color: "var(--bb-gray)" }}>CNR: {caseData.cnr_number}</span>}
                {caseData.court_name && <span style={{ fontSize: "0.58rem", color: "var(--bb-gray)" }}>{caseData.court_name}</span>}
              </div>
            </div>
            <div style={{ display: "flex", gap: "0.3rem", flexShrink: 0 }}>
              <button onClick={refreshCase} disabled={refreshing} className="bb-btn bb-btn-primary" style={{ padding: "0.3rem 0.6rem", fontSize: "0.6rem", opacity: refreshing ? 0.6 : 1 }}>
                {refreshing ? "[REFRESHING...]" : "[REFRESH]"}
              </button>
              <button onClick={deleteCase} className="bb-btn bb-btn-danger" style={{ padding: "0.3rem 0.6rem", fontSize: "0.6rem" }}>[DEL]</button>
            </div>
          </div>
        </div>

        {/* Case Info Card — 2 columns */}
        <div className="bb-panel">
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "1px", background: "var(--bb-border)" }}>
            {/* Left: Case details */}
            <div style={{ background: "var(--bb-panel)", padding: "0.6rem 0.75rem" }}>
              <div className="bb-kv" style={{ borderBottom: "none", paddingBottom: "0.15rem" }}>
                <span className="bb-kv-label">CASE NO</span>
                <span className="bb-kv-value">{caseData.case_number}/{caseData.case_year}</span>
              </div>
              {caseData.filing_date && (
                <div className="bb-kv" style={{ borderBottom: "none", paddingBottom: "0.15rem" }}>
                  <span className="bb-kv-label">FILING DATE</span>
                  <span className="bb-kv-value">{format(new Date(caseData.filing_date), "dd MMM yyyy")}</span>
                </div>
              )}
              <div className="bb-kv" style={{ borderBottom: "none", paddingBottom: "0.15rem" }}>
                <span className="bb-kv-label">STAGE</span>
                <span className="bb-kv-value">{caseData.current_status || "—"}</span>
              </div>
              {caseData.last_order_date && (
                <div className="bb-kv" style={{ borderBottom: "none" }}>
                  <span className="bb-kv-label">LAST ORDER</span>
                  <span className="bb-kv-value">{format(new Date(caseData.last_order_date), "dd MMM yyyy")}</span>
                </div>
              )}
            </div>

            {/* Right: Next Hearing (prominent) */}
            <div style={{ background: "var(--bb-panel)", padding: "0.6rem 0.75rem", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
              <span className="bb-kv-label" style={{ marginBottom: "0.3rem" }}>NEXT HEARING</span>
              {caseData.next_hearing_date ? (
                <>
                  <span style={{ fontSize: "1.1rem", fontWeight: 700, color: nextHearingDays !== null && nextHearingDays <= 7 ? "var(--bb-amber)" : nextHearingDays !== null && nextHearingDays < 0 ? "var(--bb-red)" : "var(--bb-white)" }}>
                    {format(new Date(caseData.next_hearing_date), "dd-MM-yyyy")}
                  </span>
                  <span style={{ fontSize: "0.6rem", color: "var(--bb-gray)", marginTop: "0.15rem" }}>
                    {format(new Date(caseData.next_hearing_date), "EEEE")}
                  </span>
                </>
              ) : (
                <span style={{ fontSize: "0.8rem", color: "var(--bb-gray)" }}>Not scheduled</span>
              )}
            </div>
          </div>
        </div>

        {/* 3-Column Cards: Advocate / Hearing Advocate / Judges */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1px", background: "var(--bb-border)" }}>
          {/* Advocate */}
          <div className="bb-panel" style={{ border: "none" }}>
            <div className="bb-panel-header" style={{ padding: "0.3rem 0.6rem" }}>
              <span className="bb-panel-title" style={{ fontSize: "0.6rem" }}>ADVOCATE</span>
              <span className="bb-panel-tag" style={{ fontSize: "0.5rem" }}>
                {(caseData.petitioner_advocate ? 1 : 0) + (caseData.respondent_advocate ? 1 : 0)}
              </span>
            </div>
            <div style={{ padding: "0.5rem 0.6rem", fontSize: "0.72rem" }}>
              <div style={{ color: "var(--bb-white)" }}>{caseData.petitioner_advocate || caseData.petitioner || "—"}</div>
              <div style={{ color: "var(--bb-gray)", fontSize: "0.6rem", margin: "0.2rem 0" }}>Vs.</div>
              <div style={{ color: "var(--bb-white)" }}>{caseData.respondent_advocate || caseData.respondent || "—"}</div>
            </div>
          </div>

          {/* Parties */}
          <div className="bb-panel" style={{ border: "none" }}>
            <div className="bb-panel-header" style={{ padding: "0.3rem 0.6rem" }}>
              <span className="bb-panel-title" style={{ fontSize: "0.6rem" }}>PARTIES</span>
              <span className="bb-panel-tag" style={{ fontSize: "0.5rem" }}>2</span>
            </div>
            <div style={{ padding: "0.5rem 0.6rem", fontSize: "0.72rem" }}>
              <div style={{ color: "var(--bb-white)" }}>{caseData.petitioner || "—"}</div>
              <div style={{ color: "var(--bb-gray)", fontSize: "0.6rem", margin: "0.2rem 0" }}>Vs.</div>
              <div style={{ color: "var(--bb-white)" }}>{caseData.respondent || "—"}</div>
            </div>
          </div>

          {/* Hearing Judges */}
          <div className="bb-panel" style={{ border: "none" }}>
            <div className="bb-panel-header" style={{ padding: "0.3rem 0.6rem" }}>
              <span className="bb-panel-title" style={{ fontSize: "0.6rem" }}>HEARING JUDGES</span>
              <span className="bb-panel-tag" style={{ fontSize: "0.5rem" }}>{caseData.judges ? 1 : 0}</span>
            </div>
            <div style={{ padding: "0.5rem 0.6rem", fontSize: "0.72rem", color: "var(--bb-white)" }}>
              {caseData.judges || "Not available"}
            </div>
          </div>
        </div>

        {/* Tabbed Section */}
        <div className="bb-panel">
          <div className="bb-tabs">
            {tabs.map((t) => (
              <button key={t.key} className={cn("bb-tab", activeTab === t.key && "active")} onClick={() => setActiveTab(t.key)}>
                {t.label}{t.count !== undefined ? ` (${t.count})` : ""}
              </button>
            ))}
          </div>

          {/* Tab: Listings */}
          {activeTab === "listings" && (
            <div>
              {hearings.length === 0 ? (
                <div style={{ padding: "2rem", textAlign: "center", color: "var(--bb-gray)", fontSize: "0.75rem" }}>No listing data available. Click [REFRESH] to fetch.</div>
              ) : (
                <table className="bb-table">
                  <thead><tr><th>DATE</th><th>PURPOSE</th><th>REMARKS</th></tr></thead>
                  <tbody>
                    {hearings.filter(h => !String(h.date || "").includes("CL Date")).map((h, i) => (
                      <tr key={i}>
                        <td style={{ whiteSpace: "nowrap", color: "var(--bb-amber)" }}>{String(h.date || "")}</td>
                        <td style={{ fontSize: "0.72rem" }}>{String(h.purpose || "")}</td>
                        <td style={{ fontSize: "0.72rem", color: String(h.remarks || "").includes("Disposed") ? "var(--bb-green)" : String(h.remarks || "").includes("Adjourned") || String(h.remarks || "").includes("Not taken") ? "var(--bb-red)" : "var(--bb-gray)" }}>
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
                <div style={{ padding: "2rem", textAlign: "center", color: "var(--bb-gray)", fontSize: "0.75rem" }}>No orders available. Click [REFRESH] to fetch.</div>
              ) : (
                <table className="bb-table">
                  <thead><tr><th>DATE</th><th>TYPE</th><th>DOCUMENT</th></tr></thead>
                  <tbody>
                    {orders.map((o, i) => (
                      <tr key={i}>
                        <td style={{ whiteSpace: "nowrap", color: "var(--bb-amber)" }}>{String(o.date || "")}</td>
                        <td style={{ fontSize: "0.72rem" }}>{String(o.orderType || "")}</td>
                        <td>
                          {o.pdfUrl ? (
                            <a href={String(o.pdfUrl)} target="_blank" rel="noopener noreferrer" className="bb-btn bb-btn-secondary" style={{ padding: "0.15rem 0.4rem", fontSize: "0.55rem" }}>[VIEW PDF]</a>
                          ) : "—"}
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
                <div style={{ padding: "2rem", textAlign: "center", color: "var(--bb-gray)", fontSize: "0.75rem" }}>No updates yet.</div>
              ) : (
                <div style={{ padding: "0.5rem 0.75rem", fontFamily: "var(--bb-font)", fontSize: "0.72rem" }}>
                  {updates.map((u) => (
                    <div key={u.id} style={{ padding: "0.3rem 0", borderBottom: "1px solid rgba(26,32,48,0.3)" }}>
                      <span style={{ color: "var(--bb-amber)", marginRight: "0.5rem" }}>{">"}</span>
                      <span style={{ color: "var(--bb-gray)", marginRight: "0.5rem" }}>{format(new Date(u.created_at), "dd MMM yyyy HH:mm")}</span>
                      <span style={{ color: "var(--bb-white)", marginRight: "0.5rem" }}>{u.update_type.replace(/_/g, " ").toUpperCase()}</span>
                      {u.old_value && <span style={{ color: "var(--bb-red)", marginRight: "0.3rem" }}>{u.old_value}</span>}
                      {u.old_value && u.new_value && <span style={{ color: "var(--bb-gray)", marginRight: "0.3rem" }}>→</span>}
                      {u.new_value && <span style={{ color: "var(--bb-green)" }}>{u.new_value}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab: AI Analysis */}
          {activeTab === "ai" && (
            <div style={{ padding: "0.75rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <span style={{ fontSize: "0.68rem", color: "var(--bb-amber)", fontWeight: 600 }}>AI CASE ANALYSIS</span>
                <button onClick={generateSummary} disabled={summarizing} className="bb-btn bb-btn-primary" style={{ padding: "0.25rem 0.5rem", fontSize: "0.6rem", opacity: summarizing ? 0.6 : 1 }}>
                  {summarizing ? "[GENERATING...]" : aiSummary ? "[REGENERATE]" : "[GENERATE SUMMARY]"}
                </button>
              </div>
              {aiSummary ? (
                <div style={{ fontSize: "0.78rem", color: "var(--bb-white)", lineHeight: 1.6, whiteSpace: "pre-line" }}>{aiSummary}</div>
              ) : (
                <div style={{ fontSize: "0.72rem", color: "var(--bb-gray)" }}>Click Generate Summary to get an AI analysis of this case.</div>
              )}
            </div>
          )}

          {/* Tab: Notes & Tags */}
          {activeTab === "notes" && (
            <div style={{ padding: "0.75rem" }}>
              {/* Tags */}
              <div style={{ marginBottom: "1rem" }}>
                <span style={{ fontSize: "0.6rem", color: "var(--bb-amber)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>CLASSIFICATION</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem", marginTop: "0.4rem", marginBottom: "0.4rem" }}>
                  {(caseData.tags || []).map((tag) => (
                    <span key={tag} style={{ fontSize: "0.6rem", padding: "0.15rem 0.4rem", border: "1px solid var(--bb-amber)", color: "var(--bb-amber)" }}>
                      {tag} <button onClick={() => removeTag(tag)} style={{ background: "none", border: "none", color: "var(--bb-gray)", cursor: "pointer", marginLeft: "0.2rem" }}>×</button>
                    </span>
                  ))}
                </div>
                <div style={{ display: "flex", gap: "0.3rem" }}>
                  <input type="text" value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                    placeholder="Add tag..." style={{ flex: 1 }} />
                  <button onClick={addTag} className="bb-btn bb-btn-primary" style={{ padding: "0.3rem 0.5rem", fontSize: "0.6rem" }}>[ADD]</button>
                </div>
              </div>

              {/* Notes */}
              <div>
                <span style={{ fontSize: "0.6rem", color: "var(--bb-amber)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>NOTES</span>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={5}
                  placeholder="Add notes about this case..." style={{ width: "100%", marginTop: "0.4rem", resize: "vertical" }} />
                <button onClick={saveNotes} disabled={saving} className="bb-btn bb-btn-primary" style={{ marginTop: "0.3rem", padding: "0.3rem 0.6rem", fontSize: "0.6rem", opacity: saving ? 0.6 : 1 }}>
                  {saving ? "[SAVING...]" : "[SAVE]"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Last checked */}
        {caseData.last_checked_at && (
          <div style={{ textAlign: "center", padding: "0.5rem", fontSize: "0.58rem", color: "var(--bb-gray)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
            LAST CHECKED: {format(new Date(caseData.last_checked_at), "dd MMM yyyy, HH:mm")}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
