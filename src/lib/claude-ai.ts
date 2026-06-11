/**
 * Claude AI — CAPTCHA solver & AI utilities
 *
 * Uses Anthropic Claude (claude-haiku-4-5-20251001) for:
 * 1. Solving math CAPTCHAs from court websites (SC + eCourts) via vision
 * 2. Summarizing court orders/judgments
 * 3. Generating case summaries
 */

import Anthropic from "@anthropic-ai/sdk";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

function getClient(): Anthropic {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not configured.");
  }
  return new Anthropic({ apiKey: ANTHROPIC_API_KEY });
}

/**
 * Solve a math CAPTCHA image using Claude vision.
 *
 * The image shows something like "6 + 4" or "9 - 3" in stylized text.
 * Claude reads the image and returns the numeric answer.
 *
 * @param imageBuffer - Raw image bytes (PNG/JPEG)
 * @returns The numeric answer as a string, or null if it fails
 */
export async function solveCaptchaWithVision(
  imageBuffer: Buffer,
  type: "text" | "math" = "text",
): Promise<string | null> {
  // Try free solver first (Sharp + system Tesseract binary, $0)
  try {
    const { solveCaptchaFree, solveMathCaptchaFree } =
      await import("@/lib/captcha-free");
    const freeResult =
      type === "math"
        ? await solveMathCaptchaFree(imageBuffer)
        : await solveCaptchaFree(imageBuffer);
    if (freeResult) {
      console.log(`[CAPTCHA] Solved FREE (${type}): "${freeResult}"`);
      return freeResult;
    }
    console.log(
      `[CAPTCHA] Free solver failed, falling back to Claude Haiku...`,
    );
  } catch (freeErr) {
    console.warn(
      "[CAPTCHA] Free solver error, falling back to Claude:",
      freeErr,
    );
  }

  // Fallback: Claude Haiku Vision ($0.001/solve)
  try {
    const client = getClient();
    const base64 = imageBuffer.toString("base64");

    const prompt =
      type === "math"
        ? "This image shows a simple math expression like '6 + 4' or '9 - 3'. Calculate the result. Reply with ONLY the numeric answer, nothing else."
        : "Read the CAPTCHA text in this image. It contains distorted letters and/or numbers. Reply with ONLY the exact characters shown, nothing else. No spaces, no explanation.";

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 10,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: base64,
              },
            },
            {
              type: "text",
              text: prompt,
            },
          ],
        },
      ],
    });

    const answer =
      response.content[0].type === "text"
        ? response.content[0].text.trim()
        : "";

    // Clean up: remove spaces, quotes, periods, etc.
    const cleaned = answer.replace(/[^a-zA-Z0-9]/g, "");
    if (cleaned.length > 0) {
      console.log(`[Claude Vision] CAPTCHA solved: "${answer}" → "${cleaned}"`);
      return cleaned;
    }

    console.warn(`[Claude Vision] Could not parse answer: "${answer}"`);
    return null;
  } catch (error) {
    console.error("[Claude Vision] CAPTCHA solve failed:", error);
    return null;
  }
}

/**
 * Summarize a court order or judgment using Claude.
 */
export async function summarizeOrder(
  orderText: string,
  caseTitle?: string,
): Promise<string> {
  try {
    const client = getClient();
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: `You are a legal assistant specializing in Indian court cases. Summarize the following court order/judgment in 2-3 clear sentences. Focus on: what was decided, next steps, and any important dates. Use simple language.\n\n${caseTitle ? `Case: ${caseTitle}\n\n` : ""}Order/Judgment:\n${orderText.substring(0, 3000)}`,
        },
      ],
    });

    return response.content[0].type === "text"
      ? response.content[0].text.trim()
      : "";
  } catch (error) {
    console.error("[Claude AI] Summarize failed:", error);
    return "";
  }
}

/**
 * One-line "who vs whom, over what" digest for a judgment row. Used by
 * the Live Digest so a scan of the panel reads like a wire feed. Returns
 * "" on any failure — callers treat the line as optional.
 */
export async function generateIssueLine(input: {
  title: string;
  headline?: string | null;
  courtName?: string | null;
}): Promise<string> {
  try {
    const client = getClient();
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 60,
      messages: [
        {
          role: "user",
          content: `From this Indian judgment's title and search snippet, write ONE line (maximum 18 words) stating the core issue decided or relief sought — e.g. "Anticipatory bail in NDPS commercial-quantity case refused" or "Writ against land resurvey order; gazette notification stayed". No party names (the title already shows them), no citations, no quotes, no trailing period.

Title: ${input.title}
Court: ${input.courtName || "unknown"}
Snippet: ${(input.headline || "").slice(0, 600)}`,
        },
      ],
    });
    const text =
      response.content[0]?.type === "text" ? response.content[0].text : "";
    return text
      .trim()
      .replace(/^["']|["']$/g, "")
      .slice(0, 160);
  } catch (error) {
    console.error("[Claude AI] issue line failed:", error);
    return "";
  }
}

/**
 * Generate an AI summary of a case based on its data.
 */
export async function summarizeCase(caseData: {
  caseTitle: string;
  courtType: string;
  courtName?: string;
  currentStatus?: string;
  petitioner?: string;
  respondent?: string;
  filingDate?: string;
  nextHearingDate?: string;
  lastOrderDate?: string;
  lastOrderSummary?: string;
  judges?: string;
  updates?: Array<{
    type: string;
    oldValue?: string;
    newValue?: string;
    date: string;
  }>;
}): Promise<string> {
  try {
    const client = getClient();

    const caseContext = [
      `Case: ${caseData.caseTitle}`,
      `Court: ${caseData.courtName || caseData.courtType}`,
      `Status: ${caseData.currentStatus || "Unknown"}`,
      caseData.petitioner ? `Petitioner: ${caseData.petitioner}` : null,
      caseData.respondent ? `Respondent: ${caseData.respondent}` : null,
      caseData.filingDate ? `Filed: ${caseData.filingDate}` : null,
      caseData.nextHearingDate
        ? `Next Hearing: ${caseData.nextHearingDate}`
        : null,
      caseData.lastOrderDate ? `Last Order: ${caseData.lastOrderDate}` : null,
      caseData.lastOrderSummary
        ? `Last Order Summary: ${caseData.lastOrderSummary}`
        : null,
      caseData.judges ? `Judges: ${caseData.judges}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const updatesContext =
      caseData.updates && caseData.updates.length > 0
        ? "\n\nRecent Updates:\n" +
          caseData.updates
            .slice(0, 10)
            .map(
              (u) =>
                `- ${u.date}: ${u.type}${u.newValue ? ` -> ${u.newValue}` : ""}`,
            )
            .join("\n")
        : "";

    const todayIst = new Date().toLocaleDateString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: `You are a litigation analyst writing a case brief for the practising Indian advocate who is tracking this matter. The reader is the lawyer on the case — never advise them to "consult an advocate" and never add disclaimers.

Today's date is ${todayIst} (Indian Standard Time). All dates in the case data below are in ISO format (year-month-day). Read them carefully against today's date before commenting on timing.

Write the brief as PLAIN TEXT only — no markdown, no asterisks, no heading symbols. Use 3 short paragraphs, each opening with a label and a colon, exactly in this order:
Subject matter: what the case is about and the parties' positions, as far as the data shows.
Procedural posture: current stage/status, the last order and its date, and the bench if known.
What next: the next hearing date if scheduled, or the procedural options that follow from the current stage (e.g. for a dismissed criminal revision: certified copy, appeal/SLP limitation considerations).

Be factual and terse. If a field is missing from the data, omit it silently — do not speculate or flag data-entry issues.

Case data:

${caseContext}${updatesContext}`,
        },
      ],
    });

    return response.content[0].type === "text"
      ? response.content[0].text.trim()
      : "Unable to generate summary.";
  } catch (error) {
    console.error("[Claude AI] Case summary failed:", error);
    return "Unable to generate summary. Please try again later.";
  }
}

/**
 * Check if Claude AI is configured and available.
 */
export function isAIConfigured(): boolean {
  return !!ANTHROPIC_API_KEY;
}
