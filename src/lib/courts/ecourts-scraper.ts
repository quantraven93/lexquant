/**
 * eCourts Services Scraper
 *
 * Scrapes case data from the eCourts system which covers:
 * - High Courts (hcservices.ecourts.gov.in)
 * - District Courts (services.ecourts.gov.in)
 *
 * Endpoints:
 * - HC cases: POST https://hcservices.ecourts.gov.in/hcservices/
 * - District cases: POST https://services.ecourts.gov.in/ecourtindv2/
 *
 * CAPTCHA Strategy:
 * Uses Claude AI Vision to solve image-based CAPTCHAs.
 * Cost: ~₹0.002 per solve. Accuracy: ~95%+ for eCourts text CAPTCHAs.
 */

import { solveCaptchaWithVision, isAIConfigured } from "@/lib/claude-ai";
import type {
  CaseIdentifier,
  CaseStatus,
  CourtType,
  SearchResult,
  HearingEntry,
  OrderEntry,
  CourtApiProvider,
} from "./types";

// ---- Constants ----

const ECOURTS_DC_BASE = "https://services.ecourts.gov.in/ecourtindia_v6";
const ECOURTS_HC_BASE = "https://hcservices.ecourts.gov.in/ecourtindiaHC";

const COMMON_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
  "Content-Type": "application/x-www-form-urlencoded",
};

/** State code to HC court mapping for routing */
const STATE_TO_HC: Record<string, string> = {
  "1": "allahabad",
  "2": "ap",      // Andhra Pradesh
  "3": "bombay",
  "4": "calcutta",
  "5": "chhattisgarh",
  "6": "delhi",
  "7": "guwahati",
  "8": "gujarat",
  "9": "hp",      // Himachal Pradesh
  "10": "jk",     // Jammu & Kashmir
  "11": "jharkhand",
  "12": "karnataka",
  "13": "kerala",
  "14": "mp",     // Madhya Pradesh
  "15": "madras",
  "16": "manipur",
  "17": "meghalaya",
  "18": "orissa",
  "19": "patna",
  "20": "punjab",
  "21": "rajasthan",
  "22": "sikkim",
  "23": "telangana",
  "24": "tripura",
  "25": "uttarakhand",
};

// ---- Session Management ----

interface EcourtsSession {
  cookies: string;
  captchaValue: string;
  appToken: string;
}

const MAX_CAPTCHA_RETRIES = 3;

/**
 * Gets a session from the eCourts service with CAPTCHA solved via Claude Vision.
 *
 * Flow:
 * 1. Fetch the main page → get session cookies
 * 2. Fetch the CAPTCHA image endpoint → get the image
 * 3. Send image to Claude AI Vision → get text answer
 * 4. Return session with cookies + captcha value
 */
async function getEcourtsSession(
  baseUrl: string
): Promise<EcourtsSession | null> {
  try {
    // Step 1: Get session page and cookies
    const response = await fetch(baseUrl, {
      headers: {
        ...COMMON_HEADERS,
        "Content-Type": "text/html",
      },
      signal: AbortSignal.timeout(10000),
      redirect: "follow",
    });

    if (!response.ok) {
      console.warn(
        `[eCourts] Failed to fetch session page: ${response.status}`
      );
      return null;
    }

    const setCookieHeaders = response.headers.getSetCookie?.() || [];
    const cookies = setCookieHeaders
      .map((c) => c.split(";")[0])
      .filter(Boolean)
      .join("; ");

    const html = await response.text();

    // Step 2: Extract app_token from hidden field
    const tokenMatch = html.match(/id=['"]app_token['"][^>]*value=['"]([^'"]*)['"]/i);
    const appToken = tokenMatch ? tokenMatch[1] : "";

    // Step 3: Extract CAPTCHA image URL from the page
    // eCourts uses various CAPTCHA patterns:
    // <img src="captcha_image.php" id="captcha_image">
    // <img src="/ecourtindv2/securimage/securimage_show.php" ...>
    const captchaImgMatch =
      html.match(
        /src=["']([^"']*(?:captcha|securimage)[^"']*(?:\.php|\.png|\.jpg)[^"']*)["']/i
      ) ||
      html.match(
        /id=["']captcha_image["'][^>]*src=["']([^"']+)["']/i
      ) ||
      html.match(
        /src=["']([^"']+)["'][^>]*id=["']captcha_image["']/i
      );

    if (!captchaImgMatch) {
      console.warn("[eCourts] No CAPTCHA image found on page, trying without CAPTCHA...");
      return { cookies, captchaValue: "", appToken };
    }

    let captchaUrl = captchaImgMatch[1].replace(/&amp;/g, "&");
    // Make absolute URL if relative
    if (captchaUrl.startsWith("/")) {
      const urlObj = new URL(baseUrl);
      captchaUrl = `${urlObj.origin}${captchaUrl}`;
    } else if (!captchaUrl.startsWith("http")) {
      captchaUrl = `${baseUrl.replace(/\/$/, "")}/${captchaUrl}`;
    }

    console.log(`[eCourts] CAPTCHA image URL: ${captchaUrl}`);

    // Step 3: Download the CAPTCHA image
    const imgResponse = await fetch(captchaUrl, {
      headers: {
        Cookie: cookies,
        "User-Agent": COMMON_HEADERS["User-Agent"],
        Referer: baseUrl,
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!imgResponse.ok) {
      console.warn(`[eCourts] Failed to fetch CAPTCHA image: ${imgResponse.status}`);
      return { cookies, captchaValue: "", appToken };
    }

    // Update cookies if new ones were set by CAPTCHA request
    const captchaCookies = imgResponse.headers.getSetCookie?.() || [];
    const allCookies = [
      cookies,
      ...captchaCookies.map((c) => c.split(";")[0]).filter(Boolean),
    ]
      .filter(Boolean)
      .join("; ");

    // Step 5: Solve CAPTCHA using Claude Vision
    if (!isAIConfigured()) {
      console.warn("[eCourts] Claude Vision not configured, cannot solve CAPTCHA");
      return { cookies: allCookies, captchaValue: "", appToken };
    }

    const imageBuffer = Buffer.from(await imgResponse.arrayBuffer());
    const captchaAnswer = await solveCaptchaWithVision(imageBuffer);

    if (captchaAnswer) {
      console.log(`[eCourts] CAPTCHA solved via Claude Vision: "${captchaAnswer}"`);
      return { cookies: allCookies, captchaValue: captchaAnswer, appToken };
    }

    console.warn("[eCourts] Claude Vision could not solve CAPTCHA");
    return { cookies: allCookies, captchaValue: "", appToken };
  } catch (error) {
    console.error("[eCourts] Session fetch error:", error);
    return null;
  }
}

// ---- v6 Response Helpers ----

/**
 * eCourts v6 returns JSON: { status: 0|1, errormsg?, div_captcha?, casetype_list|party_data }
 * status=0 or errormsg="Invalid Captcha" means CAPTCHA failed.
 * status=1 means success. The actual HTML is in casetype_list or party_data.
 */
function parseV6Response(text: string): { success: boolean; html: string } {
  try {
    const json = JSON.parse(text);
    if (json.status === 0 || json.errormsg?.includes("Invalid Captcha")) {
      return { success: false, html: "" };
    }
    const html = json.casetype_list || json.party_data || json.html || "";
    return { success: true, html };
  } catch {
    // Response might be raw HTML page (session expired / wrong URL)
    if (text.includes("<!DOCTYPE") || text.includes("<html")) {
      console.warn("[eCourts] Got full HTML page instead of JSON — session issue");
      return { success: false, html: "" };
    }
    if (text.includes("Invalid Captcha") || text.includes("invalid captcha")) {
      return { success: false, html: "" };
    }
    return { success: true, html: text };
  }
}

/**
 * Build the correct eCourts v6 AJAX URL: base + /?p= + endpoint
 * Also builds POST body with ajax_req and app_token appended.
 */
function buildV6Request(
  baseUrl: string,
  endpoint: string,
  params: Record<string, string>,
  session: EcourtsSession
): { url: string; body: string } {
  const url = `${baseUrl}/?p=${endpoint}`;
  const formData = new URLSearchParams(params);
  formData.set("ajax_req", "true");
  formData.set("app_token", session.appToken);
  return { url, body: formData.toString() };
}

// ---- HTML Parsing Helpers ----

/** Strips HTML tags and decodes common entities */
function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extracts a field value from an eCourts HTML response.
 * eCourts typically uses label-value pairs in table rows or divs.
 */
function extractField(html: string, label: string): string {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    // <td>Label</td><td>: Value</td>
    new RegExp(
      `<td[^>]*>\\s*${escapedLabel}\\s*</td>\\s*<td[^>]*>\\s*:?\\s*([\\s\\S]*?)</td>`,
      "i"
    ),
    // <strong>Label</strong> : Value
    new RegExp(
      `<strong[^>]*>\\s*${escapedLabel}\\s*</strong>\\s*:?\\s*([^<]+)`,
      "i"
    ),
    // <label>Label</label> <span>Value</span>
    new RegExp(
      `<label[^>]*>\\s*${escapedLabel}\\s*:?\\s*</label>\\s*<[^>]+>([^<]+)`,
      "i"
    ),
    // <b>Label :</b> Value
    new RegExp(
      `<b[^>]*>\\s*${escapedLabel}\\s*:?\\s*</b>\\s*:?\\s*([^<]+)`,
      "i"
    ),
    // Label : Value (plain text in td)
    new RegExp(
      `${escapedLabel}\\s*:\\s*([^<\\n]+)`,
      "i"
    ),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      return stripTags(match[1]);
    }
  }
  return "";
}

/**
 * Parses case status HTML from eCourts response into a CaseStatus object.
 */
function parseEcourtsCaseHtml(html: string): CaseStatus | null {
  if (!html || html.trim().length === 0) {
    return null;
  }

  // Check if the response indicates CAPTCHA failure or no data
  if (
    html.includes("Invalid Captcha") ||
    html.includes("invalid captcha") ||
    html.includes("Captcha is required")
  ) {
    console.warn("[eCourts] CAPTCHA validation failed");
    return null;
  }

  if (
    html.includes("Record Not Found") ||
    html.includes("No Record Found") ||
    html.includes("record not found")
  ) {
    return null;
  }

  const caseTitle =
    extractField(html, "Case Title") ||
    extractField(html, "Case Details");

  const petitioner =
    extractField(html, "Petitioner") ||
    extractField(html, "Petitioner/Applicant") ||
    extractField(html, "Petitioner Name") ||
    extractField(html, "Appellant");

  const respondent =
    extractField(html, "Respondent") ||
    extractField(html, "Respondent/Opponent") ||
    extractField(html, "Respondent Name") ||
    extractField(html, "Opposite Party");

  const petitionerAdvocate =
    extractField(html, "Petitioner Advocate") ||
    extractField(html, "Advocate for Petitioner") ||
    extractField(html, "Pet\\. Adv\\.");

  const respondentAdvocate =
    extractField(html, "Respondent Advocate") ||
    extractField(html, "Advocate for Respondent") ||
    extractField(html, "Resp\\. Adv\\.");

  const currentStatus =
    extractField(html, "Case Status") ||
    extractField(html, "Status") ||
    extractField(html, "Stage of Case") ||
    "Pending";

  const judges =
    extractField(html, "Coram") ||
    extractField(html, "Judge") ||
    extractField(html, "Court Number and Judge");

  const filingDate =
    extractField(html, "Filing Date") ||
    extractField(html, "Date of Filing") ||
    extractField(html, "First Hearing Date");

  const registrationDate =
    extractField(html, "Registration Date") ||
    extractField(html, "Date of Registration");

  const nextHearingDate =
    extractField(html, "Next Hearing Date") ||
    extractField(html, "Next Date") ||
    extractField(html, "Next Date of Hearing");

  const lastOrderDate =
    extractField(html, "Last Order Date") ||
    extractField(html, "Order Date");

  const decisionDate =
    extractField(html, "Decision Date") ||
    extractField(html, "Date of Decision") ||
    extractField(html, "Disposal Date");

  // Parse acts/sections
  const acts: string[] = [];
  const actsSection = html.match(
    /(?:acts|under\s+section|act[\s-]+section)[\s\S]*?<table[^>]*>([\s\S]*?)<\/table>/i
  );
  if (actsSection) {
    const actRows = actsSection[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
    for (const row of actRows) {
      const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
      const cellValues = cells.map((c) => stripTags(c));
      if (cellValues.length >= 2 && !cellValues[0].toLowerCase().includes("act")) {
        acts.push(cellValues.filter(Boolean).join(" - "));
      }
    }
  }

  // Parse hearing history
  const hearingHistory: HearingEntry[] = [];
  // eCourts has a "Case History" section with a table
  const historyMatch = html.match(
    /(?:case\s+history|hearing\s+details|business\s+on\s+date)[\s\S]*?<table[^>]*>([\s\S]*?)<\/table>/i
  );
  if (historyMatch) {
    const rows = historyMatch[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
    for (const row of rows) {
      const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
      if (cells.length >= 2) {
        const cellValues = cells.map((c) => stripTags(c));
        // Skip header rows
        if (
          cellValues[0].toLowerCase().includes("judge") ||
          cellValues[0].toLowerCase().includes("hearing") ||
          cellValues[0].toLowerCase().includes("sl") ||
          cellValues[0].toLowerCase().includes("sr") ||
          cellValues[0].toLowerCase() === "date"
        ) {
          continue;
        }
        hearingHistory.push({
          date: cellValues[0] || "",
          purpose: cellValues[1] || cellValues[2] || "",
          courtNumber: cellValues.length > 2 ? cellValues[2] : undefined,
          judge: cellValues.length > 3 ? cellValues[3] : undefined,
        });
      }
    }
  }

  // Parse orders
  const orders: OrderEntry[] = [];
  const orderMatch = html.match(
    /(?:order|orders|judgment)[\s\S]*?<table[^>]*>([\s\S]*?)<\/table>/i
  );
  if (orderMatch) {
    const rows = orderMatch[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
    for (const row of rows) {
      const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
      if (cells.length >= 2) {
        const cellValues = cells.map((c) => stripTags(c));
        if (
          cellValues[0].toLowerCase().includes("order") ||
          cellValues[0].toLowerCase().includes("sr") ||
          cellValues[0].toLowerCase().includes("sl") ||
          cellValues[0].toLowerCase() === "date"
        ) {
          continue;
        }

        const pdfMatch = row.match(/href=["']([^"']+)["']/i);

        orders.push({
          date: cellValues[0] || "",
          orderType: cellValues[1] || "Order",
          summary: cellValues.length > 2 ? cellValues[2] : undefined,
          pdfUrl: pdfMatch ? pdfMatch[1] : undefined,
        });
      }
    }
  }

  const resolvedTitle =
    caseTitle ||
    (petitioner && respondent
      ? `${petitioner} vs ${respondent}`
      : petitioner || respondent || "Unknown");

  return {
    caseTitle: resolvedTitle,
    currentStatus,
    petitioner,
    respondent,
    petitionerAdvocate: petitionerAdvocate || undefined,
    respondentAdvocate: respondentAdvocate || undefined,
    judges: judges || undefined,
    filingDate: filingDate || undefined,
    registrationDate: registrationDate || undefined,
    decisionDate: decisionDate || undefined,
    nextHearingDate: nextHearingDate || undefined,
    lastOrderDate: lastOrderDate || undefined,
    hearingHistory,
    orders,
    acts: acts.length > 0 ? acts : undefined,
    rawData: { sourceHtml: html },
  };
}

/**
 * Parses search results from eCourts HTML response.
 */
function parseEcourtsSearchHtml(
  html: string,
  courtType: CourtType
): SearchResult[] {
  const results: SearchResult[] = [];

  if (!html || html.includes("No Record Found") || html.includes("Record Not Found")) {
    return results;
  }

  if (html.includes("Invalid Captcha") || html.includes("invalid captcha")) {
    console.warn("[eCourts] CAPTCHA validation failed during search");
    return results;
  }

  const rows = html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];

  for (const row of rows) {
    const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
    if (cells.length < 3) continue;

    const cellValues = cells.map((c) => stripTags(c));

    // Skip header rows
    if (
      cellValues[0].toLowerCase().includes("sr") ||
      cellValues[0].toLowerCase().includes("sl") ||
      cellValues[0].toLowerCase().includes("case")
    ) {
      continue;
    }

    // Try to extract CNR from a link in the row
    const cnrMatch = row.match(
      /(?:cnr_number|cnr|cino)=["']?([A-Z0-9]+)["']?/i
    );

    // Try to parse case number pattern like "WP(C)/1234/2025"
    const caseNoMatch =
      cellValues[1]?.match(/([A-Za-z/().]+)\s*\/?\s*(\d+)\s*\/\s*(\d{4})/) ||
      cellValues[2]?.match(/([A-Za-z/().]+)\s*\/?\s*(\d+)\s*\/\s*(\d{4})/);

    const titleCell = cellValues.find(
      (c) => c.includes(" vs ") || c.includes(" v. ") || c.includes(" Vs ")
    );
    const parties = titleCell?.split(/\s+(?:vs|v\.)\s+/i) || [];

    results.push({
      caseTitle: titleCell || cellValues[2] || cellValues[1] || "",
      caseNumber: caseNoMatch ? caseNoMatch[2] : cellValues[1] || "",
      caseYear: caseNoMatch ? caseNoMatch[3] : "",
      caseType: caseNoMatch ? caseNoMatch[1] : "",
      courtType,
      courtName: courtType === "HC" ? "High Court" : "District Court",
      cnrNumber: cnrMatch ? cnrMatch[1] : undefined,
      status: cellValues.find((c) =>
        /pending|disposed|dismissed|allowed|decree/i.test(c)
      ),
      petitioner: parties[0]?.trim(),
      respondent: parties[1]?.trim(),
    });
  }

  return results;
}

// ---- API Calls ----

/**
 * Fetches case status from eCourts District Court service by CNR number.
 * Uses Claude Vision to solve CAPTCHA. Retries up to MAX_CAPTCHA_RETRIES times.
 */
async function fetchDistrictCaseByCNR(
  cnrNumber: string
): Promise<CaseStatus | null> {
  for (let attempt = 1; attempt <= MAX_CAPTCHA_RETRIES; attempt++) {
    const session = await getEcourtsSession(ECOURTS_DC_BASE);
    if (!session) return null;

    try {
      const { url, body } = buildV6Request(ECOURTS_DC_BASE, "cnr_status/searchByCNR/", {
        cino: cnrNumber.toUpperCase(),
        fcaptcha_code: session.captchaValue,
      }, session);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          ...COMMON_HEADERS,
          Cookie: session.cookies,
          Referer: ECOURTS_DC_BASE,
          "X-Requested-With": "XMLHttpRequest",
        },
        body,
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        console.warn(`[eCourts DC] CNR request failed: ${response.status}`);
        return null;
      }

      const text = await response.text();
      const parsed = parseV6Response(text);
      if (!parsed.success) {
        console.warn(`[eCourts DC] CAPTCHA incorrect (attempt ${attempt}/${MAX_CAPTCHA_RETRIES}), retrying...`);
        if (attempt < MAX_CAPTCHA_RETRIES) continue;
        return null;
      }

      return parseEcourtsCaseHtml(parsed.html);
    } catch (error) {
      console.error("[eCourts DC] fetchDistrictCaseByCNR error:", error);
      if (attempt < MAX_CAPTCHA_RETRIES) continue;
      return null;
    }
  }
  return null;
}

/**
 * Fetches case status from eCourts High Court service by CNR number.
 * Uses Claude Vision to solve CAPTCHA. Retries up to MAX_CAPTCHA_RETRIES times.
 */
async function fetchHCCaseByCNR(
  cnrNumber: string
): Promise<CaseStatus | null> {
  for (let attempt = 1; attempt <= MAX_CAPTCHA_RETRIES; attempt++) {
    const session = await getEcourtsSession(ECOURTS_HC_BASE);
    if (!session) return null;

    try {
      const { url, body } = buildV6Request(ECOURTS_HC_BASE, "cnr_status/searchByCNR/", {
        cino: cnrNumber.toUpperCase(),
        fcaptcha_code: session.captchaValue,
      }, session);

      const response = await fetch(url, {
        method: "POST",
        headers: { ...COMMON_HEADERS, Cookie: session.cookies, Referer: ECOURTS_HC_BASE, "X-Requested-With": "XMLHttpRequest" },
        body,
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) { console.warn(`[eCourts HC] CNR request failed: ${response.status}`); return null; }

      const text = await response.text();
      const parsed = parseV6Response(text);
      if (!parsed.success) {
        console.warn(`[eCourts HC] CAPTCHA incorrect (attempt ${attempt}/${MAX_CAPTCHA_RETRIES}), retrying...`);
        if (attempt < MAX_CAPTCHA_RETRIES) continue;
        return null;
      }

      return parseEcourtsCaseHtml(parsed.html);
    } catch (error) {
      console.error("[eCourts HC] fetchHCCaseByCNR error:", error);
      if (attempt < MAX_CAPTCHA_RETRIES) continue;
      return null;
    }
  }
  return null;
}

/**
 * Fetches case status from eCourts by case number (District Court).
 * Uses Claude Vision to solve CAPTCHA. Retries up to MAX_CAPTCHA_RETRIES times.
 */
async function fetchDistrictCaseByNumber(
  identifier: CaseIdentifier
): Promise<CaseStatus | null> {
  for (let attempt = 1; attempt <= MAX_CAPTCHA_RETRIES; attempt++) {
    const session = await getEcourtsSession(ECOURTS_DC_BASE);
    if (!session) return null;

    try {
      const { url, body } = buildV6Request(ECOURTS_DC_BASE, "casestatus/submitCaseNo", {
        case_type: identifier.caseTypeCode || identifier.caseType,
        search_case_no: identifier.caseNumber,
        rgyear: identifier.caseYear,
        state_code: identifier.stateCode || "",
        dist_code: identifier.districtCode || "",
        court_complex_code: identifier.courtCode || "0",
        est_code: "0",
        case_captcha_code: session.captchaValue,
      }, session);

      const response = await fetch(url, {
        method: "POST",
        headers: { ...COMMON_HEADERS, Cookie: session.cookies, Referer: `${ECOURTS_DC_BASE}/?p=casestatus/index`, "X-Requested-With": "XMLHttpRequest" },
        body,
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) { console.warn(`[eCourts DC] Case number request failed: ${response.status}`); return null; }

      const text = await response.text();
      const parsed = parseV6Response(text);
      if (!parsed.success) {
        console.warn(`[eCourts DC] CAPTCHA incorrect (attempt ${attempt}/${MAX_CAPTCHA_RETRIES}), retrying...`);
        if (attempt < MAX_CAPTCHA_RETRIES) continue;
        return null;
      }

      return parseEcourtsCaseHtml(parsed.html);
    } catch (error) {
      console.error("[eCourts DC] fetchDistrictCaseByNumber error:", error);
      if (attempt < MAX_CAPTCHA_RETRIES) continue;
      return null;
    }
  }
  return null;
}

/**
 * Fetches case status from eCourts by case number (High Court).
 * Uses Claude Vision to solve CAPTCHA. Retries up to MAX_CAPTCHA_RETRIES times.
 */
async function fetchHCCaseByNumber(
  identifier: CaseIdentifier
): Promise<CaseStatus | null> {
  for (let attempt = 1; attempt <= MAX_CAPTCHA_RETRIES; attempt++) {
    const session = await getEcourtsSession(ECOURTS_HC_BASE);
    if (!session) return null;

    try {
      const { url, body } = buildV6Request(ECOURTS_HC_BASE, "casestatus/submitCaseNo", {
        case_type: identifier.caseTypeCode || identifier.caseType,
        search_case_no: identifier.caseNumber,
        rgyear: identifier.caseYear,
        state_code: identifier.stateCode || "",
        case_captcha_code: session.captchaValue,
      }, session);

      const response = await fetch(url, {
        method: "POST",
        headers: { ...COMMON_HEADERS, Cookie: session.cookies, Referer: `${ECOURTS_HC_BASE}/?p=casestatus/index`, "X-Requested-With": "XMLHttpRequest" },
        body,
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) { console.warn(`[eCourts HC] Case number request failed: ${response.status}`); return null; }

      const text = await response.text();
      const parsed = parseV6Response(text);
      if (!parsed.success) {
        console.warn(`[eCourts HC] CAPTCHA incorrect (attempt ${attempt}/${MAX_CAPTCHA_RETRIES}), retrying...`);
        if (attempt < MAX_CAPTCHA_RETRIES) continue;
        return null;
      }

      return parseEcourtsCaseHtml(parsed.html);
    } catch (error) {
      console.error("[eCourts HC] fetchHCCaseByNumber error:", error);
      if (attempt < MAX_CAPTCHA_RETRIES) continue;
      return null;
    }
  }
  return null;
}

/**
 * Searches for cases by party name on eCourts District Courts.
 * Uses Claude Vision to solve CAPTCHA. Retries up to MAX_CAPTCHA_RETRIES times.
 */
async function searchDistrictByPartyName(
  partyName: string,
  stateCode?: string,
  year?: string
): Promise<SearchResult[]> {
  for (let attempt = 1; attempt <= MAX_CAPTCHA_RETRIES; attempt++) {
    const session = await getEcourtsSession(ECOURTS_DC_BASE);
    if (!session) return [];

    try {
      const { url, body } = buildV6Request(ECOURTS_DC_BASE, "casestatus/submitPartyName", {
        petres_name: partyName,
        state_code: stateCode || "",
        dist_code: "0",
        court_complex_code: "0",
        est_code: "0",
        rgyearP: year || "",
        case_status: "",
        fcaptcha_code: session.captchaValue,
      }, session);

      const response = await fetch(url, {
        method: "POST",
        headers: { ...COMMON_HEADERS, Cookie: session.cookies, Referer: `${ECOURTS_DC_BASE}/?p=casestatus/index`, "X-Requested-With": "XMLHttpRequest" },
        body,
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) return [];

      const text = await response.text();
      const parsed = parseV6Response(text);
      if (!parsed.success) {
        console.warn(`[eCourts DC] Search CAPTCHA incorrect (attempt ${attempt}/${MAX_CAPTCHA_RETRIES}), retrying...`);
        if (attempt < MAX_CAPTCHA_RETRIES) continue;
        return [];
      }

      return parseEcourtsSearchHtml(parsed.html, "DC");
    } catch (error) {
      console.error("[eCourts DC] searchByPartyName error:", error);
      if (attempt < MAX_CAPTCHA_RETRIES) continue;
      return [];
    }
  }
  return [];
}

/**
 * Searches for cases by party name on eCourts High Courts.
 * Uses Claude Vision to solve CAPTCHA. Retries up to MAX_CAPTCHA_RETRIES times.
 */
async function searchHCByPartyName(
  partyName: string,
  stateCode?: string,
  year?: string
): Promise<SearchResult[]> {
  for (let attempt = 1; attempt <= MAX_CAPTCHA_RETRIES; attempt++) {
    const session = await getEcourtsSession(ECOURTS_HC_BASE);
    if (!session) return [];

    try {
      const { url, body } = buildV6Request(ECOURTS_HC_BASE, "casestatus/submitPartyName", {
        petres_name: partyName,
        state_code: stateCode || "",
        rgyearP: year || "",
        case_status: "",
        fcaptcha_code: session.captchaValue,
      }, session);

      const response = await fetch(url, {
        method: "POST",
        headers: { ...COMMON_HEADERS, Cookie: session.cookies, Referer: `${ECOURTS_HC_BASE}/?p=casestatus/index`, "X-Requested-With": "XMLHttpRequest" },
        body,
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) return [];

      const text = await response.text();
      const parsed = parseV6Response(text);
      if (!parsed.success) {
        console.warn(`[eCourts HC] Search CAPTCHA incorrect (attempt ${attempt}/${MAX_CAPTCHA_RETRIES}), retrying...`);
        if (attempt < MAX_CAPTCHA_RETRIES) continue;
        return [];
      }

      return parseEcourtsSearchHtml(parsed.html, "HC");
    } catch (error) {
      console.error("[eCourts HC] searchByPartyName error:", error);
      if (attempt < MAX_CAPTCHA_RETRIES) continue;
      return [];
    }
  }
  return [];
}

// ---- Provider Export ----

export const ecourtsProvider: CourtApiProvider = {
  name: "eCourts Services (ecourts.gov.in)",

  async searchByPartyName(params) {
    const results: SearchResult[] = [];

    // Search HC if courtType is HC or not specified
    if (!params.courtType || params.courtType === "HC") {
      try {
        const hcResults = await searchHCByPartyName(
          params.partyName,
          params.stateCode,
          params.year
        );
        results.push(...hcResults);
      } catch (error) {
        console.error("[eCourts] HC party search failed:", error);
      }
    }

    // Search District if courtType is DC, NCLT, CF, or not specified
    if (
      !params.courtType ||
      params.courtType === "DC" ||
      params.courtType === "NCLT" ||
      params.courtType === "CF"
    ) {
      try {
        const dcResults = await searchDistrictByPartyName(
          params.partyName,
          params.stateCode,
          params.year
        );
        results.push(...dcResults);
      } catch (error) {
        console.error("[eCourts] DC party search failed:", error);
      }
    }

    return results;
  },

  async getCaseStatus(
    identifier: CaseIdentifier
  ): Promise<CaseStatus | null> {
    // Route to the appropriate court system

    // If CNR number is available, prefer CNR lookup
    if (identifier.cnrNumber) {
      const cnrResult = await this.getCaseByCNR!(identifier.cnrNumber);
      if (cnrResult) return cnrResult;
    }

    // Route based on court type
    switch (identifier.courtType) {
      case "HC":
        return await fetchHCCaseByNumber(identifier);

      case "DC":
      case "NCLT":
      case "CF":
        return await fetchDistrictCaseByNumber(identifier);

      default:
        // For unknown court types, try district first, then HC
        const dcResult = await fetchDistrictCaseByNumber(identifier);
        if (dcResult) return dcResult;
        return await fetchHCCaseByNumber(identifier);
    }
  },

  async getCaseByCNR(cnrNumber: string): Promise<CaseStatus | null> {
    if (!cnrNumber) return null;

    // CNR format: XXYY00000002025 where XX is state, YY is district
    // HC CNRs typically start with specific prefixes
    // Try HC first if the CNR pattern suggests it, otherwise try DC first

    // Heuristic: HC CNRs often have specific patterns
    // For now, try both and return the first hit
    try {
      const hcResult = await fetchHCCaseByCNR(cnrNumber);
      if (hcResult) return hcResult;
    } catch (error) {
      console.error("[eCourts] HC CNR lookup failed:", error);
    }

    try {
      const dcResult = await fetchDistrictCaseByCNR(cnrNumber);
      if (dcResult) return dcResult;
    } catch (error) {
      console.error("[eCourts] DC CNR lookup failed:", error);
    }

    return null;
  },
};
