"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardShell } from "@/components/DashboardShell";
import { COURT_TYPES } from "@/lib/utils";

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

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [courtType, setCourtType] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [trackingId, setTrackingId] = useState<string | null>(null);
  const router = useRouter();

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);

    const params = new URLSearchParams({ q: query });
    if (courtType) params.set("court_type", courtType);

    try {
      console.log("[Search] Fetching /api/search with params:", params.toString());
      const res = await fetch(`/api/search?${params}`);
      console.log("[Search] Response status:", res.status);
      const data = await res.json();
      console.log("[Search] Results:", data.results?.length || 0, "error:", data.error);
      setResults(data.results || []);
    } catch (err) {
      console.error("[Search] Fetch error:", err);
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
    } catch {
      // ignore
    }
    setTrackingId(null);
  }

  return (
    <DashboardShell>
      <div style={{ display: "flex", flexDirection: "column", gap: "1px", background: "var(--bb-border)", minHeight: "100%" }}>
        {/* Header */}
        <div className="bb-panel-header">
          <span className="bb-panel-title">COURT SEARCH TERMINAL</span>
        </div>

        {/* Search form */}
        <div className="bb-panel">
          <div className="bb-panel-body">
            <form onSubmit={handleSearch} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Enter party name (min 3 characters)..."
                style={{ flex: 1 }}
              />
              <select
                value={courtType}
                onChange={(e) => setCourtType(e.target.value)}
                style={{ width: "auto", minWidth: "120px" }}
              >
                <option value="">All Courts</option>
                {COURT_TYPES.map((ct) => (
                  <option key={ct.value} value={ct.value}>
                    {ct.label}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={loading || query.length < 3}
                className="bb-btn bb-btn-primary"
                style={{ whiteSpace: "nowrap", opacity: loading || query.length < 3 ? 0.6 : 1, cursor: loading || query.length < 3 ? "not-allowed" : "pointer" }}
              >
                {loading ? "[SEARCHING...]" : "[SEARCH]"}
              </button>
            </form>
          </div>
        </div>

        {/* Results */}
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

        {searched && !loading && (
          <div className="bb-panel">
            {results.length === 0 ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "3rem", flexDirection: "column", gap: "0.25rem" }}>
                <span style={{ color: "var(--bb-gray)", fontSize: "0.78rem" }}>NO RESULTS</span>
                <span style={{ color: "var(--bb-gray-dim)", fontSize: "0.6rem" }}>Try a different search term</span>
              </div>
            ) : (
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
                        <span style={{ fontSize: "0.68rem", color: r.status === "Disposed" ? "var(--bb-green)" : r.status === "Pending" ? "var(--bb-amber)" : "var(--bb-gray)" }}>
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
            )}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
