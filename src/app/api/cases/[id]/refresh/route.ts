import { createClient } from "@/lib/supabase/server";
import { courtService } from "@/lib/courts/court-service";
import { NextResponse } from "next/server";
import type { CaseIdentifier } from "@/lib/courts/types";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch the existing case
  const { data: caseData, error: caseError } = await supabase
    .from("cases")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (caseError || !caseData) {
    return NextResponse.json({ error: "Case not found" }, { status: 404 });
  }

  // Strip leading zeros from case number
  const cleanCaseNumber = (caseData.case_number || "").replace(/^0+/, "") || "0";

  const identifier: CaseIdentifier = {
    courtType: caseData.court_type,
    caseType: caseData.case_type || "",
    caseTypeCode: caseData.case_type_code || undefined,
    caseNumber: cleanCaseNumber,
    caseYear: caseData.case_year || "",
    cnrNumber: caseData.cnr_number || undefined,
    courtCode: caseData.court_code || undefined,
    stateCode: caseData.state_code || undefined,
    districtCode: caseData.district_code || undefined,
  };

  console.log("[Refresh] Fetching case status:", JSON.stringify(identifier));

  let caseStatus = null;
  try {
    caseStatus = await courtService.getCaseStatus(identifier);
  } catch (error) {
    console.error("[Refresh] Failed:", error);
  }

  // For SC cases, try to fetch detailed view using diary number
  // This gets judges, advocates, filing date, CNR, etc.
  if (caseData.court_type === "SC" && caseStatus?.rawData?.sourceHtml) {
    const diaryMatch = (caseStatus.rawData.sourceHtml as string).match(/data-diary-no="(\d+)"\s*data-diary-year="(\d{4})"/);
    if (diaryMatch) {
      console.log(`[Refresh] Fetching SC detail for diary ${diaryMatch[1]}/${diaryMatch[2]}`);
      try {
        // Get a fresh session page (just for cookies, no CAPTCHA needed for detail)
        const sessionRes = await fetch("https://www.sci.gov.in/case-status-case-no/", {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
          signal: AbortSignal.timeout(10000),
        });
        const sessionCookies = (sessionRes.headers.getSetCookie?.() || []).map(c => c.split(";")[0]).filter(Boolean).join("; ");

        const detailRes = await fetch(
          `https://www.sci.gov.in/wp-admin/admin-ajax.php?action=get_case_details&diary_no=${diaryMatch[1]}&diary_year=${diaryMatch[2]}&tab_name=&es_ajax_request=1&language=en`,
          {
            headers: {
              "User-Agent": "Mozilla/5.0",
              "X-Requested-With": "XMLHttpRequest",
              Referer: "https://www.sci.gov.in/case-status-case-no/",
              Cookie: sessionCookies,
            },
            signal: AbortSignal.timeout(15000),
          }
        );

        if (detailRes.ok) {
          const detailData = await detailRes.json();
          const detailHtml = typeof detailData.data === "string" ? detailData.data : "";
          if (detailHtml.length > 100) {
            console.log(`[Refresh] SC detail HTML: ${detailHtml.length} chars`);
            const stripTags = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim();
            const extractDetail = (label: string) => {
              const m = detailHtml.match(new RegExp(`<td[^>]*>\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*</td>\\s*<td[^>]*>([\\s\\S]*?)</td>`, "i"));
              return m ? stripTags(m[1]) : "";
            };

            const judgesMatch = detailHtml.match(/Present\/Last Listed On[\s\S]*?<td[^>]*>[\s\S]*?\[([\s\S]*?JUSTICE[\s\S]*?)\]/i);
            if (judgesMatch) caseStatus.judges = stripTags(judgesMatch[1]).replace(/and/gi, ", ").trim();

            const filingMatch = detailHtml.match(/Filed on\s+(\d{2}-\d{2}-\d{4})/i);
            if (filingMatch) caseStatus.filingDate = filingMatch[1];

            const disposalMatch = detailHtml.match(/Disposal Date:\s*(\d{2}-\d{2}-\d{4})/i);
            if (disposalMatch) caseStatus.decisionDate = disposalMatch[1];

            const petAdv = extractDetail("Petitioner Advocate\\(s\\)");
            if (petAdv) caseStatus.petitionerAdvocate = petAdv.split("\n")[0]?.trim();

            const respAdv = extractDetail("Respondent Advocate\\(s\\)");
            if (respAdv) caseStatus.respondentAdvocate = respAdv.split("\n")[0]?.trim();

            const cnr = extractDetail("CNR Number");
            if (cnr) caseStatus.rawData = { ...caseStatus.rawData, cnrNumber: cnr };

            console.log("[Refresh] Detail merged:", { judges: caseStatus.judges, filing: caseStatus.filingDate, petAdv: caseStatus.petitionerAdvocate });
          }
        }
      } catch (detailErr) {
        console.warn("[Refresh] SC detail fetch failed:", detailErr);
      }
    }
  }

  if (!caseStatus) {
    return NextResponse.json(
      { error: "Could not fetch case details from court. CAPTCHA may have failed. Try again." },
      { status: 502 }
    );
  }

  // Convert DD-MM-YYYY dates to YYYY-MM-DD for Supabase
  function toISO(dateStr?: string): string | null {
    if (!dateStr) return null;
    const m = dateStr.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    // Already ISO or other format
    if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return dateStr.substring(0, 10);
    return null;
  }

  console.log("[Refresh] Got data:", {
    petitioner: caseStatus.petitioner,
    respondent: caseStatus.respondent,
    status: caseStatus.currentStatus,
    nextHearing: caseStatus.nextHearingDate,
    judges: caseStatus.judges,
    regDate: caseStatus.registrationDate,
  });

  // Build title from refreshed data
  const newTitle =
    (caseStatus.caseTitle && caseStatus.caseTitle !== "Unknown" ? caseStatus.caseTitle : null) ||
    (caseStatus.petitioner && caseStatus.respondent
      ? `${caseStatus.petitioner} vs ${caseStatus.respondent}`
      : null) ||
    caseData.case_title;

  // Update the case with fresh data
  const updateData: Record<string, unknown> = {
    last_checked_at: new Date().toISOString(),
  };

  if (newTitle) updateData.case_title = newTitle;
  if (caseStatus.currentStatus) updateData.current_status = caseStatus.currentStatus;
  if (caseStatus.petitioner) updateData.petitioner = caseStatus.petitioner;
  if (caseStatus.respondent) updateData.respondent = caseStatus.respondent;
  if (caseStatus.petitionerAdvocate) updateData.petitioner_advocate = caseStatus.petitionerAdvocate;
  if (caseStatus.respondentAdvocate) updateData.respondent_advocate = caseStatus.respondentAdvocate;
  if (caseStatus.judges) updateData.judges = caseStatus.judges;
  if (caseStatus.nextHearingDate) { const d = toISO(caseStatus.nextHearingDate); if (d) updateData.next_hearing_date = d; }
  if (caseStatus.lastOrderDate) { const d = toISO(caseStatus.lastOrderDate); if (d) updateData.last_order_date = d; }
  if (caseStatus.lastOrderSummary) updateData.last_order_summary = caseStatus.lastOrderSummary;
  if (caseStatus.filingDate) { const d = toISO(caseStatus.filingDate); if (d) updateData.filing_date = d; }
  if (caseStatus.registrationDate) { const d = toISO(caseStatus.registrationDate); if (d) updateData.registration_date = d; }
  if (caseStatus.decisionDate) { const d = toISO(caseStatus.decisionDate); if (d) updateData.decision_date = d; }
  if (caseStatus.rawData) updateData.raw_data = caseStatus.rawData;

  const { error: updateError } = await supabase
    .from("cases")
    .update(updateData)
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, updated: Object.keys(updateData).length });
}
