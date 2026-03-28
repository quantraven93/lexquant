/**
 * Free CAPTCHA solver using Sharp + Tesseract.js
 *
 * Ported from openjustice-in/ecourts Python approach:
 * 1. Remove gray interference lines (color ~0x707070)
 * 2. Threshold to binary
 * 3. Crop to text region
 * 4. OCR with Tesseract.js (LSTM engine)
 *
 * Cost: $0. No API calls.
 * Accuracy: ~70-80% per attempt. Retry up to 5 times.
 *
 * Falls back to Claude Haiku Vision if all attempts fail.
 */

import sharp from "sharp";

let tesseractWorker: import("tesseract.js").Worker | null = null;

async function getWorker() {
  if (tesseractWorker) return tesseractWorker;
  const Tesseract = await import("tesseract.js");
  tesseractWorker = await Tesseract.createWorker("eng");
  await tesseractWorker.setParameters({
    tessedit_char_whitelist: "abcdefghijklmnopqrstuvwxyz0123456789",
    tessedit_pageseg_mode: "8" as unknown as import("tesseract.js").PSM, // Single word
  });
  return tesseractWorker;
}

/**
 * Preprocess eCourts CAPTCHA image using Sharp.
 * Removes interference lines, thresholds, and crops.
 */
async function preprocessCaptcha(imageBuffer: Buffer): Promise<Buffer> {
  // Get raw pixel data
  const { data, info } = await sharp(imageBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const processed = Buffer.from(data);

  // Step 1: Remove gray interference lines (RGB ~0x70,0x70,0x70 ± tolerance)
  const LINE_COLOR = 0x70;
  const TOLERANCE = 15;
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    if (
      Math.abs(r - LINE_COLOR) < TOLERANCE &&
      Math.abs(g - LINE_COLOR) < TOLERANCE &&
      Math.abs(b - LINE_COLOR) < TOLERANCE
    ) {
      // Replace line pixels with white
      processed[i] = 255;
      processed[i + 1] = 255;
      processed[i + 2] = 255;
      processed[i + 3] = 255;
    }
  }

  // Step 2: Threshold to binary (dark text = black, rest = white)
  const THRESHOLD = 100;
  for (let i = 0; i < processed.length; i += channels) {
    const gray = (processed[i] + processed[i + 1] + processed[i + 2]) / 3;
    const val = gray < THRESHOLD ? 0 : 255;
    processed[i] = val;
    processed[i + 1] = val;
    processed[i + 2] = val;
  }

  // Step 3: Convert back to PNG, crop to text region, and resize for better OCR
  const result = await sharp(processed, { raw: { width, height, channels } })
    .extract({
      left: Math.min(27, width - 1),
      top: Math.min(15, height - 1),
      width: Math.min(163, width - 27),
      height: Math.min(50, height - 15),
    })
    .resize({ width: 326, height: 100, fit: "fill" }) // 2x upscale for better OCR
    .sharpen()
    .png()
    .toBuffer();

  return result;
}

/**
 * Solve eCourts text CAPTCHA for free using image processing + Tesseract.
 * Returns the CAPTCHA text (5 lowercase alphanumeric chars) or null.
 */
export async function solveCaptchaFree(
  imageBuffer: Buffer
): Promise<string | null> {
  try {
    const processed = await preprocessCaptcha(imageBuffer);
    const worker = await getWorker();
    const { data: { text } } = await worker.recognize(processed);

    const cleaned = text.trim().toLowerCase().replace(/[^a-z0-9]/g, "");

    if (cleaned.length === 5) {
      console.log(`[Free CAPTCHA] Solved: "${cleaned}"`);
      return cleaned;
    }

    // Try without strict 5-char validation if close
    if (cleaned.length >= 4 && cleaned.length <= 6) {
      const result = cleaned.substring(0, 5);
      console.log(`[Free CAPTCHA] Partial: "${text.trim()}" → "${result}" (${cleaned.length} chars)`);
      return result;
    }

    console.warn(`[Free CAPTCHA] Failed: got "${text.trim()}" → "${cleaned}" (${cleaned.length} chars)`);
    return null;
  } catch (error) {
    console.error("[Free CAPTCHA] Error:", error);
    return null;
  }
}

/**
 * Solve SC math CAPTCHA for free.
 * SC CAPTCHAs show simple math like "6 + 4" or "9 - 3".
 * Sharp can clean the image, Tesseract reads digits and operator.
 */
export async function solveMathCaptchaFree(
  imageBuffer: Buffer
): Promise<string | null> {
  try {
    // Simpler preprocessing for math CAPTCHAs (cleaner images)
    const processed = await sharp(imageBuffer)
      .greyscale()
      .threshold(128)
      .resize({ width: 300, height: 80, fit: "fill" })
      .sharpen()
      .png()
      .toBuffer();

    const worker = await getWorker();
    // Temporarily change whitelist for math
    await worker.setParameters({
      tessedit_char_whitelist: "0123456789+-= ",
      tessedit_pageseg_mode: "7" as unknown as import("tesseract.js").PSM, // Single line
    });

    const { data: { text } } = await worker.recognize(processed);

    // Restore original whitelist
    await worker.setParameters({
      tessedit_char_whitelist: "abcdefghijklmnopqrstuvwxyz0123456789",
      tessedit_pageseg_mode: "8" as unknown as import("tesseract.js").PSM,
    });

    const cleaned = text.trim();
    console.log(`[Free CAPTCHA] Math OCR: "${cleaned}"`);

    // Try to evaluate the math expression
    const mathMatch = cleaned.match(/(\d+)\s*([+-])\s*(\d+)/);
    if (mathMatch) {
      const a = parseInt(mathMatch[1]);
      const op = mathMatch[2];
      const b = parseInt(mathMatch[3]);
      const result = op === "+" ? a + b : a - b;
      console.log(`[Free CAPTCHA] Math: ${a} ${op} ${b} = ${result}`);
      return String(result);
    }

    return null;
  } catch (error) {
    console.error("[Free CAPTCHA] Math error:", error);
    return null;
  }
}
