/**
 * Claude AI — CAPTCHA solver & AI utilities
 *
 * Uses Anthropic Claude (claude-sonnet-4-20250514) for:
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
  type: "text" | "math" = "text"
): Promise<string | null> {
  try {
    const client = getClient();
    const base64 = imageBuffer.toString("base64");

    const prompt = type === "math"
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
      response.content[0].type === "text" ? response.content[0].text.trim() : "";

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
  caseTitle?: string
): Promise<string> {
  try {
    const client = getClient();
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
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
      caseData.lastOrderDate
        ? `Last Order: ${caseData.lastOrderDate}`
        : null,
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
                `- ${u.date}: ${u.type}${u.newValue ? ` -> ${u.newValue}` : ""}`
            )
            .join("\n")
        : "";

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: `You are an Indian legal assistant. Provide a clear, concise case summary in 3-5 sentences. Include: (1) What the case is about, (2) Current status and position, (3) Next steps or what to expect. Use plain language a non-lawyer can understand. Be factual, don't speculate.\n\nSummarize this Indian court case:\n\n${caseContext}${updatesContext}`,
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
