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

  // HC cases: fetch detail via search → token → o_civil_case_history.php
  if (caseData.court_type === "HC" && caseData.petitioner) {
    console.log("[Refresh HC] Fetching detail for:", caseData.case_title);
    try {
      const { solveCaptchaWithVision } = await import("@/lib/claude-ai");
      const HC_BASE = "https://hcservices.ecourts.gov.in/ecourtindiaHC";
      const stateCode = caseData.state_code || "2"; // Default AP

      // Step 1: Get session + CSRF + CAPTCHA
      const pageRes = await fetch(`${HC_BASE}/cases/ki_petres.php?state_cd=${stateCode}&dist_cd=1&court_code=1`, {
        headers: { "User-Agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36" },
        signal: AbortSignal.timeout(15000),
      });
      const pageCookies = (pageRes.headers.getSetCookie?.() || []).map(c => c.split(";")[0]).filter(Boolean).join("; ");
      const pageHtml = await pageRes.text();
      const csrf = pageHtml.match(/csrfMagicToken = "([^"]+)"/)?.[1] || "";
      const capPath = pageHtml.match(/\/ecourtindiaHC\/securimage\/securimage_show\.php[^"']*/)?.[0] || "";

      if (!csrf || !capPath) throw new Error("Could not get HC session");

      // Step 2: Solve CAPTCHA
      const capRes = await fetch(`https://hcservices.ecourts.gov.in${capPath}`, {
        headers: { Cookie: pageCookies, "User-Agent": "Mozilla/5.0", Referer: `${HC_BASE}/cases/ki_petres.php` },
        signal: AbortSignal.timeout(10000),
      });
      const allCookies = [pageCookies, ...(capRes.headers.getSetCookie?.() || []).map(c => c.split(";")[0])].filter(Boolean).join("; ");
      const capAnswer = await solveCaptchaWithVision(Buffer.from(await capRes.arrayBuffer()), "text");
      if (!capAnswer) throw new Error("CAPTCHA solve failed");
      console.log(`[Refresh HC] CAPTCHA: ${capAnswer}`);

      // Step 3: Search by party name to get token
      const searchName = (caseData.petitioner || "").split(" ").slice(0, 2).join(" "); // First 2 words
      const searchBody = new URLSearchParams({
        __csrf_magic: csrf, action_code: "showRecords",
        state_code: stateCode, dist_code: "1", court_code: "1",
        f: "Both", petres_name: searchName, rgyear: caseData.case_year || "", captcha: capAnswer,
      });
      const searchRes = await fetch(`${HC_BASE}/cases/ki_petres_qry.php`, {
        method: "POST", headers: { "User-Agent": "Mozilla/5.0", "Content-Type": "application/x-www-form-urlencoded",
          "X-Requested-With": "XMLHttpRequest", Cookie: allCookies, Referer: `${HC_BASE}/cases/ki_petres.php?state_cd=${stateCode}&dist_cd=1&court_code=1` },
        body: searchBody.toString(), signal: AbortSignal.timeout(30000),
      });
      const searchText = await searchRes.text();
      if (searchText.length < 50 || searchText.includes("error1")) throw new Error("HC search failed or CAPTCHA wrong");

      // Find matching record by CNR
      const clean = searchText.startsWith("\ufeff") ? searchText.substring(1) : searchText;
      const targetCnr = caseData.cnr_number || "";
      let hcCaseId = "", hcToken = "";
      for (const rec of clean.split("##")) {
        const fields = rec.split("~");
        if (fields.length >= 8 && fields[3] === targetCnr) {
          hcCaseId = fields[0]; hcToken = fields[7];
          break;
        }
      }
      // If no CNR match, try first record
      if (!hcCaseId) {
        const fields = clean.split("##")[0]?.split("~") || [];
        if (fields.length >= 8) { hcCaseId = fields[0]; hcToken = fields[7]; }
      }

      if (!hcCaseId || !hcToken) throw new Error("Could not find case in HC search results");
      console.log(`[Refresh HC] Found token for case ${hcCaseId}`);

      // Step 4: Fetch case detail
      const detailBody = new URLSearchParams({
        __csrf_magic: csrf, court_code: "1", state_code: stateCode, dist_code: "1",
        case_no: hcCaseId, cino: targetCnr || "", token: hcToken, appFlag: "",
      });
      const detailRes = await fetch(`${HC_BASE}/cases/o_civil_case_history.php`, {
        method: "POST", headers: { "User-Agent": "Mozilla/5.0", "Content-Type": "application/x-www-form-urlencoded",
          "X-Requested-With": "XMLHttpRequest", Cookie: allCookies, Referer: `${HC_BASE}/cases/ki_petres.php?state_cd=${stateCode}&dist_cd=1&court_code=1` },
        body: detailBody.toString(), signal: AbortSignal.timeout(30000),
      });
      const detailHtml = await detailRes.text();
      console.log(`[Refresh HC] Detail: ${detailHtml.length} chars`);

      if (detailHtml.length < 200) throw new Error("HC detail response too short");

      // Step 5: Parse detail HTML
      const stripTags = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim();

      const filingDate = detailHtml.match(/Filing Date.*?:\s*(\d{2}-\d{2}-\d{4})/i)?.[1] || "";
      const regDate = detailHtml.match(/Registration Date.*?:\s*(\d{2}-\d{2}-\d{4})/i)?.[1] || "";
      const nextHearing = detailHtml.match(/Next Hearing Date.*?:\s*([^<]+)/i)?.[1]?.trim() || "";
      const stage = detailHtml.match(/Stage of Case.*?:\s*([^<]+)/i)?.[1]?.trim() || "";
      // Find judge from hearing history — look for actual judge name, not column headers
      const judgeMatch = detailHtml.match(/CAUSE LIST.*?:\s*([A-Z][A-Z\s.]+(?:RAO|REDDY|KUMAR|MISHRA|BHATTI|SHARMA|SINGH|GUPTA|NAIDU|PRASAD|MURTHY|JHA|IYER|NAIR|MENON|PILLAI|DAS|ROY|PATEL|KHAN|ALI|JAIN|AGARWAL|MITHAL|HEGDE|GOWDA|SWAMY|BABU|CHARY|VARMA|VERMA|SAXENA|TYAGI|YADAV|CHAUHAN|THAKUR|RATHORE|MEHTA)[A-Z\s.]*)/i);
      let judge = judgeMatch ? judgeMatch[1].trim() : "";
      // Fallback: look for "Judge" in table data (not headers)
      if (!judge) {
        const judgeData = detailHtml.match(/<td[^>]*class="[^"]*"[^>]*>\s*([A-Z][A-Z\s.]{5,50}(?:RAO|REDDY|KUMAR|JHA|SHARMA|SINGH|BHATTI|MISHRA))\s*<\/td>/i);
        if (judgeData) judge = judgeData[1].trim();
      }

      // Convert DD-MM-YYYY to YYYY-MM-DD
      function toISO(d: string): string | null {
        const m = d.match(/^(\d{2})-(\d{2})-(\d{4})$/);
        return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
      }

      // Convert "23rd March 2026" to ISO
      function parseHCDate(d: string): string | null {
        const m = d.match(/(\d{1,2})(?:st|nd|rd|th)?\s+(\w+)\s+(\d{4})/i);
        if (!m) return toISO(d);
        const months: Record<string, string> = { january:"01",february:"02",march:"03",april:"04",may:"05",june:"06",july:"07",august:"08",september:"09",october:"10",november:"11",december:"12" };
        const mon = months[m[2].toLowerCase()];
        return mon ? `${m[3]}-${mon}-${m[1].padStart(2,"0")}` : null;
      }

      const updateData: Record<string, unknown> = { last_checked_at: new Date().toISOString() };
      if (filingDate) { const d = toISO(filingDate); if (d) updateData.filing_date = d; }
      if (regDate) { const d = toISO(regDate); if (d) updateData.registration_date = d; }
      if (nextHearing) { const d = parseHCDate(nextHearing); if (d) updateData.next_hearing_date = d; }
      if (stage) updateData.current_status = stage;
      if (judge) updateData.judges = judge;
      updateData.raw_data = { ...caseData.raw_data, sourceHtml: detailHtml, hcDetailFetched: true };

      console.log("[Refresh HC] Parsed:", { filing: filingDate, reg: regDate, nextHearing, stage, judge });

      await supabase.from("cases").update(updateData).eq("id", id);
      return NextResponse.json({ success: true, updated: Object.keys(updateData).length });
    } catch (hcErr) {
      console.error("[Refresh HC] Failed:", hcErr);
      await supabase.from("cases").update({ last_checked_at: new Date().toISOString() }).eq("id", id);
      return NextResponse.json({ error: "HC detail fetch failed: " + (hcErr instanceof Error ? hcErr.message : "Unknown error") + ". Try again." }, { status: 502 });
    }
  }

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

            const petAdv = extractDetail("Petitioner Advocate(s)");
            if (petAdv) caseStatus.petitionerAdvocate = petAdv.split(/\n|<br/)[0]?.trim();

            const respAdv = extractDetail("Respondent Advocate(s)");
            if (respAdv) caseStatus.respondentAdvocate = respAdv.split(/\n|<br/)[0]?.trim();

            const cnr = extractDetail("CNR Number");
            if (cnr) caseStatus.rawData = { ...caseStatus.rawData, cnrNumber: cnr };

            console.log("[Refresh] Detail merged:", { judges: caseStatus.judges, filing: caseStatus.filingDate, petAdv: caseStatus.petitionerAdvocate });

            // Fetch listing dates tab
            try {
              const listRes = await fetch(
                `https://www.sci.gov.in/wp-admin/admin-ajax.php?action=get_case_details&diary_no=${diaryMatch[1]}&diary_year=${diaryMatch[2]}&tab_name=listing_dates&es_ajax_request=1&language=en`,
                { headers: { "User-Agent": "Mozilla/5.0", "X-Requested-With": "XMLHttpRequest", Cookie: sessionCookies, Referer: "https://www.sci.gov.in/case-status-case-no/" }, signal: AbortSignal.timeout(10000) }
              );
              if (listRes.ok) {
                const listData = await listRes.json();
                const listHtml = typeof listData.data === "string" ? listData.data : "";
                const listRows = [...listHtml.matchAll(/<tr[^>]*>(?!.*<th)([\s\S]*?)<\/tr>/gi)];
                const hearings = listRows.map(r => {
                  const cells = [...r[0].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => stripTags(m[1]));
                  // Skip header-like rows
                  if (cells[0]?.includes("CL Date") || cells[0]?.includes("Date")) return null;
                  return cells.length >= 4 ? { date: cells[0], stage: cells[2], purpose: cells[3], judges: cells[5]?.substring(0, 80), remarks: cells[7] } : null;
                }).filter(Boolean);
                if (hearings.length > 0) {
                  caseStatus.hearingHistory = hearings as Array<{ date: string; purpose: string; judge?: string }>;
                  caseStatus.rawData = { ...caseStatus.rawData, hearings };
                  console.log(`[Refresh] ${hearings.length} hearing dates found`);
                }
              }
            } catch { /* non-fatal */ }

            // Fetch orders tab
            try {
              const ordRes = await fetch(
                `https://www.sci.gov.in/wp-admin/admin-ajax.php?action=get_case_details&diary_no=${diaryMatch[1]}&diary_year=${diaryMatch[2]}&tab_name=judgement_orders&es_ajax_request=1&language=en`,
                { headers: { "User-Agent": "Mozilla/5.0", "X-Requested-With": "XMLHttpRequest", Cookie: sessionCookies, Referer: "https://www.sci.gov.in/case-status-case-no/" }, signal: AbortSignal.timeout(10000) }
              );
              if (ordRes.ok) {
                const ordData = await ordRes.json();
                const ordHtml = typeof ordData.data === "string" ? ordData.data : "";
                const ordRows = [...ordHtml.matchAll(/<tr[^>]*>(?!.*<th)([\s\S]*?)<\/tr>/gi)];
                const orders = ordRows.map(r => {
                  const dateMatch = r[0].match(/(\d{2}-\d{2}-\d{4})/);
                  const pdfMatch = r[0].match(/href="([^"]*\.pdf[^"]*)"/i);
                  const typeMatch = r[0].match(/\[(.*?)\]/);
                  return dateMatch ? { date: dateMatch[1], orderType: typeMatch ? typeMatch[1] : "Order", pdfUrl: pdfMatch ? pdfMatch[1] : undefined } : null;
                }).filter(Boolean);
                if (orders.length > 0) {
                  caseStatus.orders = orders as Array<{ date: string; orderType: string; pdfUrl?: string }>;
                  caseStatus.lastOrderDate = orders[0]?.date;
                  caseStatus.rawData = { ...caseStatus.rawData, orders };
                  console.log(`[Refresh] ${orders.length} orders found`);
                }
              }
            } catch { /* non-fatal */ }
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
