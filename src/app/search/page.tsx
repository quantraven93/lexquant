"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardShell } from "@/components/DashboardShell";
import { COURT_TYPES, INDIAN_STATES } from "@/lib/utils";

interface SearchResult {
  caseTitle: string;
  caseNumber: string;
  caseYear: string;
  caseType: string;
  courtType: string;
  courtName: string;
  courtCode?: string;
  cnrNumber?: string;
  status?: string;
  petitioner?: string;
  respondent?: string;
  nextHearingDate?: string;
}

type SearchTab = "party" | "case_number" | "advocate" | "cnr";

const YEARS = Array.from({ length: 30 }, (_, i) => String(new Date().getFullYear() - i));

export default function SearchPage() {
  const [tab, setTab] = useState<SearchTab>("party");
  const [courtType, setCourtType] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [year, setYear] = useState("");
  // Party name fields
  const [partyName, setPartyName] = useState("");
  // Case number fields
  const [caseType, setCaseType] = useState("");
  const [caseNumber, setCaseNumber] = useState("");
  // Advocate fields
  const [advocateName, setAdvocateName] = useState("");
  // CNR field
  const [cnrNumber, setCnrNumber] = useState("");

  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [trackingId, setTrackingId] = useState<string | null>(null);
  const router = useRouter();

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setSearched(true);

    const params = new URLSearchParams();
    params.set("type", tab);
    if (courtType) params.set("court_type", courtType);
    if (stateCode) params.set("state_code", stateCode);
    if (year) params.set("year", year);

    switch (tab) {
      case "party":
        if (!partyName.trim() || partyName.trim().length < 3) { setLoading(false); return; }
        params.set("q", partyName.trim());
        break;
      case "case_number":
        if (!caseNumber.trim()) { setLoading(false); return; }
        params.set("q", caseNumber.trim());
        if (caseType) params.set("case_type", caseType);
        break;
      case "advocate":
        if (!advocateName.trim() || advocateName.trim().length < 3) { setLoading(false); return; }
        params.set("q", advocateName.trim());
        break;
      case "cnr":
        if (!cnrNumber.trim() || cnrNumber.trim().length < 10) { setLoading(false); return; }
        params.set("q", cnrNumber.trim().toUpperCase());
        break;
    }

    try {
      console.log("[Search] Fetching:", params.toString());
      const res = await fetch(`/api/search?${params}`);
      const data = await res.json();
      console.log("[Search] Results:", data.results?.length || 0);
      setResults(data.results || []);
    } catch (err) {
      console.error("[Search] Error:", err);
      setResults([]);
    }
    setLoading(false);
  }

  async function trackCase(result: SearchResult) {
    setTrackingId(result.caseNumber + result.caseYear);
    try {
      const res = await fetch("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courtType: result.courtType,
          caseType: result.caseType,
          caseNumber: result.caseNumber,
          caseYear: result.caseYear,
          courtCode: result.courtCode,
          cnrNumber: result.cnrNumber,
          courtName: result.courtName,
          caseTitle: result.caseTitle,
          petitioner: result.petitioner,
          respondent: result.respondent,
          status: result.status,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        router.push(`/case/${data.case.id}`);
      }
    } catch { /* ignore */ }
    setTrackingId(null);
  }

  const tabs: { key: SearchTab; label: string }[] = [
    { key: "party", label: "BY PARTY NAME" },
    { key: "case_number", label: "BY CASE NUMBER" },
    { key: "advocate", label: "BY ADVOCATE" },
    { key: "cnr", label: "BY CNR" },
  ];

  const showStateSelector = courtType === "HC" || courtType === "DC";

  return (
    <DashboardShell>
      <div style={{ display: "flex", flexDirection: "column", gap: "1px", background: "var(--bb-border)", minHeight: "100%" }}>
        {/* Header */}
        <div className="bb-panel-header">
          <span className="bb-panel-title">COURT SEARCH TERMINAL</span>
        </div>

        {/* Search Tabs */}
        <div className="bb-panel">
          <div className="bb-tabs">
            {tabs.map((t) => (
              <button
                key={t.key}
                className={`bb-tab ${tab === t.key ? "active" : ""}`}
                onClick={() => { setTab(t.key); setResults([]); setSearched(false); }}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="bb-panel-body" style={{ padding: "1rem" }}>
            <form onSubmit={handleSearch}>
              {/* Court selector — all tabs */}
              <div style={{ display: "grid", gridTemplateColumns: showStateSelector ? "1fr 1fr" : "1fr", gap: "0.5rem", marginBottom: "0.75rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.6rem", color: "var(--bb-gray)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.25rem", fontWeight: 600 }}>
                    COURT
                  </label>
                  <select value={courtType} onChange={(e) => setCourtType(e.target.value)} style={{ width: "100%" }}>
                    <option value="">All Courts</option>
                    {COURT_TYPES.map((ct) => (
                      <option key={ct.value} value={ct.value}>{ct.label}</option>
                    ))}
                  </select>
                </div>
                {showStateSelector && (
                  <div>
                    <label style={{ display: "block", fontSize: "0.6rem", color: "var(--bb-gray)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.25rem", fontWeight: 600 }}>
                      STATE
                    </label>
                    <select value={stateCode} onChange={(e) => setStateCode(e.target.value)} style={{ width: "100%" }}>
                      <option value="">All States</option>
                      {INDIAN_STATES.map((s) => (
                        <option key={s.code} value={s.code}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Tab-specific fields */}
              {tab === "party" && (
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "0.5rem", marginBottom: "0.75rem" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.6rem", color: "var(--bb-gray)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.25rem", fontWeight: 600 }}>
                      PARTY NAME
                    </label>
                    <input type="text" value={partyName} onChange={(e) => setPartyName(e.target.value)}
                      placeholder="Enter party name (min 3 chars)" style={{ width: "100%" }} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "0.6rem", color: "var(--bb-gray)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.25rem", fontWeight: 600 }}>
                      YEAR
                    </label>
                    <select value={year} onChange={(e) => setYear(e.target.value)} style={{ width: "100%" }}>
                      <option value="">All Years</option>
                      {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {tab === "case_number" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem", marginBottom: "0.75rem" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.6rem", color: "var(--bb-gray)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.25rem", fontWeight: 600 }}>
                      CASE TYPE
                    </label>
                    <input type="text" value={caseType} onChange={(e) => setCaseType(e.target.value)}
                      placeholder="e.g. WP, SLP, CRL.A" style={{ width: "100%" }} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "0.6rem", color: "var(--bb-gray)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.25rem", fontWeight: 600 }}>
                      CASE NUMBER
                    </label>
                    <input type="text" value={caseNumber} onChange={(e) => setCaseNumber(e.target.value)}
                      placeholder="e.g. 1234" style={{ width: "100%" }} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "0.6rem", color: "var(--bb-gray)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.25rem", fontWeight: 600 }}>
                      YEAR
                    </label>
                    <select value={year} onChange={(e) => setYear(e.target.value)} style={{ width: "100%" }}>
                      <option value="">Select Year</option>
                      {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {tab === "advocate" && (
                <div style={{ marginBottom: "0.75rem" }}>
                  <label style={{ display: "block", fontSize: "0.6rem", color: "var(--bb-gray)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.25rem", fontWeight: 600 }}>
                    ADVOCATE NAME
                  </label>
                  <input type="text" value={advocateName} onChange={(e) => setAdvocateName(e.target.value)}
                    placeholder="Enter advocate name (min 3 chars)" style={{ width: "100%" }} />
                </div>
              )}

              {tab === "cnr" && (
                <div style={{ marginBottom: "0.75rem" }}>
                  <label style={{ display: "block", fontSize: "0.6rem", color: "var(--bb-gray)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.25rem", fontWeight: 600 }}>
                    CNR NUMBER
                  </label>
                  <input type="text" value={cnrNumber} onChange={(e) => setCnrNumber(e.target.value.toUpperCase())}
                    placeholder="e.g. APHC010673172022 (16 chars)" style={{ width: "100%" }} maxLength={16} />
                  <p style={{ fontSize: "0.55rem", color: "var(--bb-gray-dim)", marginTop: "0.2rem" }}>
                    16-character unique case number from eCourts
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="bb-btn bb-btn-primary"
                style={{ width: "100%", opacity: loading ? 0.6 : 1, cursor: loading ? "not-allowed" : "pointer" }}
              >
                {loading ? "[SEARCHING...]" : "[SEARCH]"}
              </button>
            </form>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="bb-panel">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "3rem", gap: "0.5rem" }}>
              <span className="live-dot" />
              <span style={{ color: "var(--bb-amber)", fontSize: "0.78rem", letterSpacing: "0.05em" }}>
                SEARCHING COURTS... SOLVING CAPTCHA... THIS MAY TAKE 10-15 SECONDS
              </span>
            </div>
          </div>
        )}

        {/* Results */}
        {searched && !loading && (
          <div className="bb-panel">
            {results.length === 0 ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "3rem", flexDirection: "column", gap: "0.25rem" }}>
                <span style={{ color: "var(--bb-gray)", fontSize: "0.78rem" }}>NO RESULTS</span>
                <span style={{ color: "var(--bb-gray-dim)", fontSize: "0.6rem" }}>Try a different search term</span>
              </div>
            ) : (
              <>
                <div className="bb-panel-header">
                  <span className="bb-panel-title">RESULTS</span>
                  <span style={{ fontSize: "0.6rem", color: "var(--bb-gray)" }}>{results.length} CASES</span>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table className="bb-table">
                    <thead>
                      <tr>
                        <th>COURT</th>
                        <th>PARTIES</th>
                        <th>CASE NO</th>
                        <th>STATUS</th>
                        <th style={{ textAlign: "right" }}>ACTION</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((r, i) => (
                        <tr key={i}>
                          <td>
                            <span style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--bb-amber)" }}>
                              {r.courtType}
                            </span>
                          </td>
                          <td style={{ maxWidth: "300px" }}>
                            <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {r.petitioner && r.respondent
                                ? `${r.petitioner} vs ${r.respondent}`
                                : r.caseTitle || `${r.caseNumber}/${r.caseYear}`}
                            </div>
                            <div style={{ fontSize: "0.6rem", color: "var(--bb-gray)" }}>{r.courtName}</div>
                          </td>
                          <td style={{ whiteSpace: "nowrap" }}>
                            {r.caseType} {r.caseNumber}/{r.caseYear}
                          </td>
                          <td>
                            <span style={{ fontSize: "0.68rem", color: r.status === "Disposed" || r.status === "DISPOSED" ? "var(--bb-green)" : r.status === "Pending" || r.status === "PENDING" ? "var(--bb-amber)" : "var(--bb-gray)" }}>
                              {r.status || "-"}
                            </span>
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <button
                              onClick={() => trackCase(r)}
                              disabled={trackingId === r.caseNumber + r.caseYear}
                              className="bb-btn bb-btn-primary"
                              style={{ padding: "0.25rem 0.6rem", fontSize: "0.6rem", opacity: trackingId === r.caseNumber + r.caseYear ? 0.6 : 1 }}
                            >
                              {trackingId === r.caseNumber + r.caseYear ? "[...]" : "[+ TRACK]"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
