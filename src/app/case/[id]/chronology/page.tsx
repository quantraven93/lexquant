"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";

interface CaseDetail {
  id: string;
  case_title: string;
  court_type: string;
  court_name: string | null;
  case_type: string | null;
  case_number: string;
  case_year: string | null;
  cnr_number: string | null;
  petitioner: string | null;
  respondent: string | null;
  petitioner_advocate: string | null;
  respondent_advocate: string | null;
  judges: string | null;
  filing_date: string | null;
  current_status: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw_data: Record<string, any>;
}

interface ChronoRow {
  date: string;
  kind: "hearing" | "order";
  purpose: string;
  remarks: string;
  pdfUrl?: string;
}

function parseDate(s: string): number {
  if (!s) return 0;
  // DD-MM-YYYY (eCourts) or YYYY-MM-DD (ISO).
  const dmy = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (dmy) {
    return Date.UTC(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : 0;
}

function formatDate(s: string): string {
  const t = parseDate(s);
  if (!t) return s;
  try {
    return new Date(t).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return s;
  }
}

function buildRows(c: CaseDetail): ChronoRow[] {
  const out: ChronoRow[] = [];
  const hearings = (c.raw_data?.hearings || []) as Array<
    Record<string, string>
  >;
  for (const h of hearings) {
    const date = String(h.date || "").trim();
    if (!date || date.includes("CL Date")) continue;
    out.push({
      date,
      kind: "hearing",
      purpose: String(h.purpose || "—"),
      remarks: String(h.remarks || "—"),
    });
  }
  const orders = (c.raw_data?.orders || []) as Array<Record<string, string>>;
  for (const o of orders) {
    const date = String(o.date || "").trim();
    if (!date) continue;
    out.push({
      date,
      kind: "order",
      purpose: String(o.orderType || "Order"),
      remarks: "",
      pdfUrl: o.pdfUrl ? String(o.pdfUrl) : undefined,
    });
  }
  // Earliest first — chronology convention for pleadings.
  out.sort((a, b) => parseDate(a.date) - parseDate(b.date));
  return out;
}

export default function CaseChronologyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [caseData, setCaseData] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/cases/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setCaseData(d.case);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div style={{ padding: "2rem", fontFamily: "Georgia, serif" }}>
        Loading chronology…
      </div>
    );
  }

  if (!caseData) {
    return (
      <div style={{ padding: "2rem", fontFamily: "Georgia, serif" }}>
        <p>Case not found.</p>
        <Link href="/dashboard">← Back to dashboard</Link>
      </div>
    );
  }

  const rows = buildRows(caseData);
  const parties =
    caseData.petitioner && caseData.respondent
      ? `${caseData.petitioner} vs ${caseData.respondent}`
      : caseData.case_title || "—";
  const caseNoStr = [
    caseData.case_type,
    caseData.case_number,
    caseData.case_year ? `/${caseData.case_year}` : "",
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  return (
    <>
      <style>{`
        @media screen {
          .chrono-page {
            max-width: 800px;
            margin: 0 auto;
            padding: 1.5rem 2rem 3rem;
            background: #fff;
            color: #111;
            font-family: Georgia, "Times New Roman", serif;
            font-size: 12pt;
            line-height: 1.5;
          }
          .chrono-controls {
            display: flex;
            justify-content: flex-end;
            gap: 0.5rem;
            margin-bottom: 1rem;
          }
          .chrono-controls button,
          .chrono-controls a {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            font-size: 11pt;
            padding: 0.4rem 0.9rem;
            border: 1px solid #444;
            background: #fff;
            color: #111;
            cursor: pointer;
            text-decoration: none;
            border-radius: 2px;
          }
          .chrono-controls .primary {
            background: #111;
            color: #fff;
            border-color: #111;
          }
        }
        @media print {
          html, body { background: #fff; }
          .chrono-controls { display: none; }
          .chrono-page {
            max-width: none;
            margin: 0;
            padding: 0;
            background: #fff;
            color: #000;
            font-family: Georgia, "Times New Roman", serif;
            font-size: 11pt;
            line-height: 1.5;
          }
          a { color: #000; text-decoration: none; }
          .chrono-table { page-break-inside: auto; }
          .chrono-table tr { page-break-inside: avoid; }
          @page { margin: 1.8cm 1.5cm; }
        }
        .chrono-title {
          text-align: center;
          font-size: 1.4rem;
          font-weight: bold;
          margin: 0 0 0.4rem;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .chrono-sub {
          text-align: center;
          font-size: 0.95rem;
          color: #333;
          margin: 0 0 1.2rem;
        }
        .chrono-meta {
          display: grid;
          grid-template-columns: max-content 1fr;
          gap: 0.2rem 1rem;
          margin-bottom: 1.4rem;
          font-size: 0.95rem;
        }
        .chrono-meta dt { font-weight: bold; }
        .chrono-meta dd { margin: 0; }
        .chrono-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 1.4rem;
        }
        .chrono-table th,
        .chrono-table td {
          border: 1px solid #222;
          padding: 0.4rem 0.6rem;
          vertical-align: top;
          text-align: left;
          font-size: 0.92rem;
        }
        .chrono-table th {
          background: #f1f1f1;
          font-weight: bold;
          text-transform: uppercase;
          font-size: 0.78rem;
          letter-spacing: 0.04em;
        }
        .chrono-footer {
          margin-top: 2rem;
          font-size: 0.78rem;
          color: #555;
          text-align: right;
          font-style: italic;
        }
      `}</style>
      <main className="chrono-page">
        <div className="chrono-controls">
          <Link href={`/case/${id}`} className="">
            Back to case
          </Link>
          <button
            type="button"
            className="primary"
            onClick={() => window.print()}
          >
            Print / Save as PDF
          </button>
        </div>

        <h1 className="chrono-title">Case Chronology</h1>
        <p className="chrono-sub">{parties}</p>

        <dl className="chrono-meta">
          {caseNoStr && (
            <>
              <dt>Case No.</dt>
              <dd>{caseNoStr}</dd>
            </>
          )}
          {caseData.court_name && (
            <>
              <dt>Court</dt>
              <dd>{caseData.court_name}</dd>
            </>
          )}
          {caseData.cnr_number && (
            <>
              <dt>CNR</dt>
              <dd>{caseData.cnr_number}</dd>
            </>
          )}
          {caseData.filing_date && (
            <>
              <dt>Filed on</dt>
              <dd>{formatDate(caseData.filing_date)}</dd>
            </>
          )}
          {caseData.judges && (
            <>
              <dt>Hearing judges</dt>
              <dd>{caseData.judges}</dd>
            </>
          )}
          {caseData.petitioner_advocate && (
            <>
              <dt>Petitioner&apos;s advocate</dt>
              <dd>{caseData.petitioner_advocate}</dd>
            </>
          )}
          {caseData.respondent_advocate && (
            <>
              <dt>Respondent&apos;s advocate</dt>
              <dd>{caseData.respondent_advocate}</dd>
            </>
          )}
          {caseData.current_status && (
            <>
              <dt>Present status</dt>
              <dd>{caseData.current_status}</dd>
            </>
          )}
        </dl>

        {rows.length === 0 ? (
          <p style={{ fontStyle: "italic", color: "#555" }}>
            No hearing or order data available for this case. Refresh the case
            from the eCourts source on the case detail page first.
          </p>
        ) : (
          <table className="chrono-table">
            <thead>
              <tr>
                <th style={{ width: "16%" }}>Date</th>
                <th style={{ width: "12%" }}>Type</th>
                <th>Purpose</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td style={{ whiteSpace: "nowrap" }}>{formatDate(r.date)}</td>
                  <td style={{ textTransform: "capitalize" }}>{r.kind}</td>
                  <td>
                    {r.purpose}
                    {r.pdfUrl && (
                      <>
                        {" "}
                        <a
                          href={r.pdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          [order PDF]
                        </a>
                      </>
                    )}
                  </td>
                  <td>{r.remarks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <p className="chrono-footer">
          Generated by LexQuant on{" "}
          {new Date().toLocaleString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </main>
    </>
  );
}
