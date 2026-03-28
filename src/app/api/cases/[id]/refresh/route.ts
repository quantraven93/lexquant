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

  if (!caseStatus) {
    return NextResponse.json(
      { error: "Could not fetch case details from court. CAPTCHA may have failed. Try again." },
      { status: 502 }
    );
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
  if (caseStatus.nextHearingDate) updateData.next_hearing_date = caseStatus.nextHearingDate;
  if (caseStatus.lastOrderDate) updateData.last_order_date = caseStatus.lastOrderDate;
  if (caseStatus.lastOrderSummary) updateData.last_order_summary = caseStatus.lastOrderSummary;
  if (caseStatus.filingDate) updateData.filing_date = caseStatus.filingDate;
  if (caseStatus.registrationDate) updateData.registration_date = caseStatus.registrationDate;
  if (caseStatus.decisionDate) updateData.decision_date = caseStatus.decisionDate;
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
