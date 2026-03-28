"use client";

import { useEffect, useState, use } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { cn, COURT_TYPE_COLORS, STATUS_COLORS } from "@/lib/utils";
import { format } from "date-fns";
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
  raw_data: Record<string, unknown>;
}

interface CaseUpdate {
  id: string;
  update_type: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
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
    if (!confirm("Are you sure you want to remove this case from tracking?"))
      return;
    await fetch(`/api/cases/${id}`, { method: "DELETE" });
    router.push("/dashboard");
  }

  async function refreshCase() {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/cases/${id}/refresh`, { method: "POST" });
      if (res.ok) {
        // Reload case data
        const caseRes = await fetch(`/api/cases/${id}`);
        const data = await caseRes.json();
        setCaseData(data.case);
        setUpdates(data.updates || []);
      } else {
        const data = await res.json();
        alert(data.error || "Refresh failed. Try again.");
      }
    } catch {
      alert("Refresh failed. Try again.");
    }
    setRefreshing(false);
  }

  async function generateSummary() {
    setSummarizing(true);
    try {
      const res = await fetch(`/api/cases/${id}/summarize`, {
        method: "POST",
      });
      const data = await res.json();
      setAiSummary(data.summary || "Failed to generate summary.");
    } catch {
      setAiSummary("Failed to generate summary. Please try again.");
    }
    setSummarizing(false);
  }

  if (loading) {
    return (
      <DashboardShell>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
          <span style={{ color: "var(--bb-amber)", fontSize: "0.75rem", letterSpacing: "0.1em", fontWeight: 600 }}>[LOADING CASE...]</span>
        </div>
      </DashboardShell>
    );
  }

  if (!caseData) {
    return (
      <DashboardShell>
        <div style={{ padding: "1rem" }}>
          <p style={{ color: "var(--bb-gray)", fontSize: "0.78rem" }}>Case not found.</p>
          <Link href="/dashboard" style={{ color: "var(--bb-amber)", fontSize: "0.78rem", textDecoration: "none", marginTop: "0.5rem", display: "inline-block" }}>
            &lt; BACK TO DASHBOARD
          </Link>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div style={{ maxWidth: "900px", display: "flex", flexDirection: "column", gap: "1px", background: "var(--bb-border)", padding: "0" }}>
        {/* Header */}
        <div style={{ background: "var(--bb-panel)", padding: "0.6rem 0.75rem" }}>
          <Link
            href="/dashboard"
            style={{ color: "var(--bb-amber)", fontSize: "0.68rem", textDecoration: "none", fontWeight: 600, letterSpacing: "0.05em" }}
          >
            &lt; BACK
          </Link>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginTop: "0.4rem" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{ fontSize: "1.1rem", color: "var(--bb-amber)", fontFamily: "var(--bb-font)", fontWeight: 700, margin: 0, lineHeight: 1.3 }}>
                {caseData.case_title ||
                  `${caseData.case_number}/${caseData.case_year}`}
              </h1>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.35rem", flexWrap: "wrap" }}>
                <span
                  className={cn(
                    "inline-flex px-2 py-0.5 text-xs font-medium",
                    COURT_TYPE_COLORS[caseData.court_type] || "bg-gray-800/50 text-gray-500"
                  )}
                  style={{ fontSize: "0.6rem" }}
                >
                  {caseData.court_type}
                </span>
                <span
                  className={cn(
                    "inline-flex px-2 py-0.5 text-xs font-medium",
                    STATUS_COLORS[caseData.current_status || "Unknown"] ||
                      "bg-gray-800/50 text-gray-500"
                  )}
                  style={{ fontSize: "0.6rem" }}
                >
                  {caseData.current_status || "Unknown"}
                </span>
                {caseData.cnr_number && (
                  <span style={{ fontSize: "0.6rem", color: "var(--bb-gray)" }}>
                    CNR: {caseData.cnr_number}
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: "0.3rem", flexShrink: 0, marginLeft: "0.5rem" }}>
              <button
                onClick={refreshCase}
                disabled={refreshing}
                className="bb-btn bb-btn-primary"
                style={{ padding: "0.3rem 0.6rem", fontSize: "0.6rem", opacity: refreshing ? 0.6 : 1 }}
              >
                {refreshing ? "[REFRESHING...]" : "[REFRESH]"}
              </button>
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

        {/* AI Summary */}
        <div className="bb-panel">
          <div className="bb-panel-header">
            <span className="bb-panel-title">AI ANALYSIS</span>
            <button
              onClick={generateSummary}
              disabled={summarizing}
              className="bb-btn bb-btn-primary"
              style={{ padding: "0.2rem 0.6rem", fontSize: "0.58rem", opacity: summarizing ? 0.6 : 1 }}
            >
              {summarizing
                ? "[GENERATING...]"
                : aiSummary
                ? "[REGENERATE]"
                : "[GENERATE SUMMARY]"}
            </button>
          </div>
          <div className="bb-panel-body">
            {aiSummary ? (
              <p style={{ fontSize: "0.78rem", color: "var(--bb-white)", lineHeight: 1.6, whiteSpace: "pre-line" }}>
                {aiSummary}
              </p>
            ) : (
              <p style={{ fontSize: "0.78rem", color: "var(--bb-gray)" }}>
                Click &quot;Generate Summary&quot; to get an AI-powered overview of this case.
              </p>
            )}
          </div>
        </div>

        {/* Info Grid */}
        <div className="bb-panel">
          <div className="bb-panel-header">
            <span className="bb-panel-title">CASE INFO</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1px", background: "var(--bb-border)" }}>
            <div style={{ background: "var(--bb-panel)", padding: "0.5rem 0.75rem" }}>
              <div className="bb-kv-label">NEXT HEARING</div>
              <div className="bb-kv-value" style={{ marginTop: "0.15rem" }}>
                {caseData.next_hearing_date
                  ? format(new Date(caseData.next_hearing_date), "dd MMM yyyy")
                  : "Not scheduled"}
              </div>
            </div>
            <div style={{ background: "var(--bb-panel)", padding: "0.5rem 0.75rem" }}>
              <div className="bb-kv-label">LAST ORDER</div>
              <div className="bb-kv-value" style={{ marginTop: "0.15rem" }}>
                {caseData.last_order_date
                  ? format(new Date(caseData.last_order_date), "dd MMM yyyy")
                  : "No orders"}
              </div>
              {caseData.last_order_summary && (
                <div style={{ fontSize: "0.6rem", color: "var(--bb-gray)", marginTop: "0.15rem" }}>{caseData.last_order_summary}</div>
              )}
            </div>
            <div style={{ background: "var(--bb-panel)", padding: "0.5rem 0.75rem" }}>
              <div className="bb-kv-label">BENCH</div>
              <div className="bb-kv-value" style={{ marginTop: "0.15rem" }}>
                {caseData.judges || "Not available"}
              </div>
            </div>
            <div style={{ background: "var(--bb-panel)", padding: "0.5rem 0.75rem" }}>
              <div className="bb-kv-label">FILING DATE</div>
              <div className="bb-kv-value" style={{ marginTop: "0.15rem" }}>
                {caseData.filing_date
                  ? format(new Date(caseData.filing_date), "dd MMM yyyy")
                  : "Not available"}
              </div>
            </div>
          </div>
        </div>

        {/* Parties */}
        <div className="bb-panel">
          <div className="bb-panel-header">
            <span className="bb-panel-title">PARTIES</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1px", background: "var(--bb-border)" }}>
            <div style={{ background: "var(--bb-panel)", padding: "0.5rem 0.75rem" }}>
              <div className="bb-kv-label">PETITIONER</div>
              <div style={{ fontSize: "0.82rem", color: "var(--bb-white)", marginTop: "0.2rem" }}>
                {caseData.petitioner || "-"}
              </div>
              {caseData.petitioner_advocate && (
                <div style={{ fontSize: "0.6rem", color: "var(--bb-gray)", marginTop: "0.15rem" }}>
                  Adv. {caseData.petitioner_advocate}
                </div>
              )}
            </div>
            <div style={{ background: "var(--bb-panel)", padding: "0.5rem 0.75rem" }}>
              <div className="bb-kv-label">RESPONDENT</div>
              <div style={{ fontSize: "0.82rem", color: "var(--bb-white)", marginTop: "0.2rem" }}>
                {caseData.respondent || "-"}
              </div>
              {caseData.respondent_advocate && (
                <div style={{ fontSize: "0.6rem", color: "var(--bb-gray)", marginTop: "0.15rem" }}>
                  Adv. {caseData.respondent_advocate}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tags / Classification */}
        <div className="bb-panel">
          <div className="bb-panel-header">
            <span className="bb-panel-title">CLASSIFICATION</span>
          </div>
          <div className="bb-panel-body">
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginBottom: "0.5rem" }}>
              {(caseData.tags || []).map((tag) => (
                <span
                  key={tag}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.3rem",
                    padding: "0.2rem 0.5rem",
                    border: "1px solid var(--bb-amber)",
                    color: "var(--bb-amber)",
                    fontSize: "0.65rem",
                    fontWeight: 600,
                    letterSpacing: "0.04em",
                  }}
                >
                  {tag}
                  <button
                    onClick={() => removeTag(tag)}
                    style={{ background: "none", border: "none", color: "var(--bb-amber-dim)", cursor: "pointer", fontSize: "0.7rem", padding: 0, lineHeight: 1 }}
                  >
                    x
                  </button>
                </span>
              ))}
            </div>
            <div style={{ display: "flex", gap: "0.4rem" }}>
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                placeholder="Add tag..."
                style={{ flex: 1 }}
              />
              <button
                onClick={addTag}
                className="bb-btn bb-btn-primary"
                style={{ padding: "0.35rem 0.75rem", fontSize: "0.6rem" }}
              >
                [ADD]
              </button>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="bb-panel">
          <div className="bb-panel-header">
            <span className="bb-panel-title">NOTES</span>
          </div>
          <div className="bb-panel-body">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              style={{ width: "100%", boxSizing: "border-box", resize: "none", fontFamily: "var(--bb-font)" }}
              placeholder="Add notes about this case..."
            />
            <button
              onClick={saveNotes}
              disabled={saving}
              className="bb-btn bb-btn-primary"
              style={{ marginTop: "0.4rem", opacity: saving ? 0.6 : 1 }}
            >
              {saving ? "[SAVING...]" : "[SAVE]"}
            </button>
          </div>
        </div>

        {/* Hearing History */}
        {caseData.raw_data?.hearings && (caseData.raw_data.hearings as Array<Record<string, string>>).length > 0 && (
          <div className="bb-panel">
            <div className="bb-panel-header">
              <span className="bb-panel-title">HEARING HISTORY</span>
              <span className="bb-panel-tag">{(caseData.raw_data.hearings as Array<Record<string, string>>).length}</span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="bb-table">
                <thead>
                  <tr>
                    <th>DATE</th>
                    <th>PURPOSE</th>
                    <th>REMARKS</th>
                  </tr>
                </thead>
                <tbody>
                  {(caseData.raw_data.hearings as Array<Record<string, string>>).map((h, i) => (
                    <tr key={i}>
                      <td style={{ whiteSpace: "nowrap", color: "var(--bb-amber)" }}>{h.date}</td>
                      <td style={{ fontSize: "0.72rem" }}>{h.purpose}</td>
                      <td style={{ fontSize: "0.72rem", color: h.remarks?.includes("Disposed") ? "var(--bb-green)" : h.remarks?.includes("Adjourned") || h.remarks?.includes("Not taken") ? "var(--bb-red)" : "var(--bb-gray)" }}>
                        {h.remarks || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Orders */}
        {caseData.raw_data?.orders && (caseData.raw_data.orders as Array<Record<string, string>>).length > 0 && (
          <div className="bb-panel">
            <div className="bb-panel-header">
              <span className="bb-panel-title">ORDERS & JUDGMENTS</span>
              <span className="bb-panel-tag">{(caseData.raw_data.orders as Array<Record<string, string>>).length}</span>
            </div>
            <table className="bb-table">
              <thead>
                <tr>
                  <th>DATE</th>
                  <th>TYPE</th>
                  <th>DOCUMENT</th>
                </tr>
              </thead>
              <tbody>
                {(caseData.raw_data.orders as Array<Record<string, string>>).map((o, i) => (
                  <tr key={i}>
                    <td style={{ whiteSpace: "nowrap", color: "var(--bb-amber)" }}>{o.date}</td>
                    <td style={{ fontSize: "0.72rem" }}>{o.orderType}</td>
                    <td>
                      {o.pdfUrl ? (
                        <a href={o.pdfUrl} target="_blank" rel="noopener noreferrer"
                          className="bb-btn bb-btn-secondary"
                          style={{ padding: "0.15rem 0.4rem", fontSize: "0.55rem" }}>
                          [VIEW PDF]
                        </a>
                      ) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Update History */}
        <div className="bb-panel">
          <div className="bb-panel-header">
            <span className="bb-panel-title">UPDATE LOG</span>
            <span className="bb-panel-tag">{updates.length}</span>
          </div>
          <div className="bb-panel-body">
            {updates.length === 0 ? (
              <p style={{ fontSize: "0.78rem", color: "var(--bb-gray)" }}>No updates yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                {updates.map((u) => (
                  <div
                    key={u.id}
                    style={{
                      fontFamily: "var(--bb-font)",
                      fontSize: "0.72rem",
                      color: "var(--bb-white)",
                      padding: "0.3rem 0",
                      borderBottom: "1px solid rgba(26,32,48,0.5)",
                    }}
                  >
                    <span style={{ color: "var(--bb-amber)" }}>&gt; </span>
                    <span style={{ color: "var(--bb-gray)" }}>
                      {format(new Date(u.created_at), "dd MMM yyyy, HH:mm")}
                    </span>
                    <span style={{ color: "var(--bb-gray-dim)" }}> | </span>
                    <span style={{ color: "var(--bb-amber)", fontWeight: 600 }}>
                      {u.update_type.replace(/_/g, " ").toUpperCase()}
                    </span>
                    {(u.old_value || u.new_value) && (
                      <>
                        <span style={{ color: "var(--bb-gray-dim)" }}> | </span>
                        {u.old_value && (
                          <span style={{ color: "var(--bb-red)" }}>{u.old_value}</span>
                        )}
                        {u.old_value && u.new_value && (
                          <span style={{ color: "var(--bb-gray-dim)" }}> &rarr; </span>
                        )}
                        {u.new_value && (
                          <span style={{ color: "var(--bb-green)" }}>{u.new_value}</span>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Last checked */}
        {caseData.last_checked_at && (
          <div style={{ background: "var(--bb-panel)", padding: "0.4rem 0.75rem", textAlign: "center" }}>
            <span style={{ fontSize: "0.6rem", color: "var(--bb-gray)" }}>
              LAST CHECKED: {format(new Date(caseData.last_checked_at), "dd MMM yyyy, HH:mm")}
            </span>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
