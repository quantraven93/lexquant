"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardShell } from "@/components/DashboardShell";
import { COURT_TYPES, INDIAN_STATES } from "@/lib/utils";

export default function AddCasePage() {
  const [mode, setMode] = useState<"case_number" | "cnr">("case_number");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const router = useRouter();

  const [courtType, setCourtType] = useState("DC");
  const [stateCode, setStateCode] = useState("");
  const [caseType, setCaseType] = useState("");
  const [caseNumber, setCaseNumber] = useState("");
  const [caseYear, setCaseYear] = useState(new Date().getFullYear().toString());
  const [cnrNumber, setCnrNumber] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    const body =
      mode === "cnr"
        ? { courtType: "DC", caseType: "", caseNumber: "", caseYear: "", cnrNumber }
        : { courtType, caseType, caseNumber, caseYear, stateCode };

    try {
      const res = await fetch("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json();
        setSuccess("Case added successfully!");
        setTimeout(() => router.push(`/case/${data.case.id}`), 1000);
      } else {
        const data = await res.json();
        setError(data.error || "Failed to add case");
      }
    } catch {
      setError("Network error. Please try again.");
    }
    setLoading(false);
  }

  const showStateSelector = courtType === "HC" || courtType === "DC";

  return (
    <DashboardShell>
      <div style={{ maxWidth: "640px", padding: "1rem" }}>
        {/* Header */}
        <div className="bb-panel-header" style={{ marginBottom: "1px" }}>
          <span className="bb-panel-title">ADD CASE TO WATCHLIST</span>
        </div>

        <div className="bb-panel">
          {/* Mode toggle tabs */}
          <div className="bb-tabs">
            <button
              onClick={() => setMode("case_number")}
              className={`bb-tab ${mode === "case_number" ? "active" : ""}`}
            >
              [CASE NUMBER]
            </button>
            <button
              onClick={() => setMode("cnr")}
              className={`bb-tab ${mode === "cnr" ? "active" : ""}`}
            >
              [CNR NUMBER]
            </button>
          </div>

          <div className="bb-panel-body" style={{ padding: "0.75rem" }}>
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {mode === "cnr" ? (
                <div>
                  <label style={{ display: "block", fontSize: "0.6rem", color: "var(--bb-gray)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: "0.3rem" }}>
                    CNR NUMBER
                  </label>
                  <input
                    type="text"
                    value={cnrNumber}
                    onChange={(e) => setCnrNumber(e.target.value.toUpperCase())}
                    placeholder="e.g., DLCT010012345"
                    required
                    style={{ width: "100%", boxSizing: "border-box" }}
                  />
                  <p style={{ fontSize: "0.6rem", color: "var(--bb-gray-dim)", marginTop: "0.25rem" }}>
                    16-character unique case number from eCourts
                  </p>
                </div>
              ) : (
                <>
                  <div>
                    <label style={{ display: "block", fontSize: "0.6rem", color: "var(--bb-gray)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: "0.3rem" }}>
                      COURT TYPE
                    </label>
                    <select
                      value={courtType}
                      onChange={(e) => setCourtType(e.target.value)}
                      style={{ width: "100%", boxSizing: "border-box" }}
                    >
                      {COURT_TYPES.map((ct) => (
                        <option key={ct.value} value={ct.value}>
                          {ct.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {showStateSelector && (
                    <div>
                      <label style={{ display: "block", fontSize: "0.6rem", color: "var(--bb-gray)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: "0.3rem" }}>
                        STATE
                      </label>
                      <select
                        value={stateCode}
                        onChange={(e) => setStateCode(e.target.value)}
                        style={{ width: "100%", boxSizing: "border-box" }}
                      >
                        <option value="">Select State</option>
                        {INDIAN_STATES.map((s) => (
                          <option key={s.code} value={s.code}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label style={{ display: "block", fontSize: "0.6rem", color: "var(--bb-gray)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: "0.3rem" }}>
                      CASE TYPE
                    </label>
                    <input
                      type="text"
                      value={caseType}
                      onChange={(e) => setCaseType(e.target.value)}
                      placeholder="e.g., Civil Appeal, Writ Petition, SLP"
                      required
                      style={{ width: "100%", boxSizing: "border-box" }}
                    />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "0.6rem", color: "var(--bb-gray)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: "0.3rem" }}>
                        CASE NUMBER
                      </label>
                      <input
                        type="text"
                        value={caseNumber}
                        onChange={(e) => setCaseNumber(e.target.value)}
                        placeholder="e.g., 1234"
                        required
                        style={{ width: "100%", boxSizing: "border-box" }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "0.6rem", color: "var(--bb-gray)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: "0.3rem" }}>
                        YEAR
                      </label>
                      <input
                        type="text"
                        value={caseYear}
                        onChange={(e) => setCaseYear(e.target.value)}
                        placeholder="e.g., 2024"
                        required
                        style={{ width: "100%", boxSizing: "border-box" }}
                      />
                    </div>
                  </div>
                </>
              )}

              {error && (
                <div style={{ padding: "0.5rem 0.75rem", border: "1px solid var(--bb-red)", background: "rgba(255,59,59,0.05)", fontSize: "0.78rem", color: "var(--bb-red)" }}>
                  {error}
                </div>
              )}

              {success && (
                <div style={{ padding: "0.5rem 0.75rem", border: "1px solid var(--bb-green)", background: "rgba(0,210,106,0.05)", fontSize: "0.78rem", color: "var(--bb-green)" }}>
                  {success}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="bb-btn bb-btn-primary"
                style={{ width: "100%", opacity: loading ? 0.6 : 1, cursor: loading ? "not-allowed" : "pointer" }}
              >
                {loading ? "[ADDING...]" : "[+ ADD TO WATCHLIST]"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
