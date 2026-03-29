/**
 * Free CAPTCHA solver using Sharp + system Tesseract binary
 *
 * Ported from openjustice-in/ecourts Python approach:
 * 1. Remove gray interference lines (color ~0x707070)
 * 2. Threshold to binary
 * 3. Crop to text region
 * 4. OCR with system `tesseract` binary via child_process
 *
 * Cost: $0. No API calls.
 * Requires: `brew install tesseract` (or apt-get install tesseract-ocr)
 */

import sharp from "sharp";
import { execFileSync } from "child_process";
import { writeFileSync, unlinkSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

/**
 * Check if system tesseract is available
 */
function hasTesseract(): boolean {
  try {
    execFileSync("tesseract", ["--version"], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Preprocess eCourts CAPTCHA image using Sharp.
 */
async function preprocessCaptcha(imageBuffer: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(imageBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const processed = Buffer.from(data);

  // Remove gray interference lines (RGB ~0x70 ± tolerance)
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (Math.abs(r - 0x70) < 15 && Math.abs(g - 0x70) < 15 && Math.abs(b - 0x70) < 15) {
      processed[i] = 255; processed[i + 1] = 255; processed[i + 2] = 255; processed[i + 3] = 255;
    }
  }

  // Threshold to binary
  for (let i = 0; i < processed.length; i += channels) {
    const gray = (processed[i] + processed[i + 1] + processed[i + 2]) / 3;
    const val = gray < 100 ? 0 : 255;
    processed[i] = val; processed[i + 1] = val; processed[i + 2] = val;
  }

  return sharp(processed, { raw: { width, height, channels } })
    .extract({
      left: Math.min(27, width - 1),
      top: Math.min(15, height - 1),
      width: Math.min(163, width - 27),
      height: Math.min(50, height - 15),
    })
    .resize({ width: 326, height: 100, fit: "fill" })
    .sharpen()
    .png()
    .toBuffer();
}

/**
 * Run system tesseract on an image buffer and return the text.
 */
function runTesseract(imageBuffer: Buffer, whitelist: string): string {
  const inputPath = join(tmpdir(), `captcha-${Date.now()}.png`);
  const outputBase = join(tmpdir(), `captcha-out-${Date.now()}`);

  try {
    writeFileSync(inputPath, imageBuffer);
    execFileSync("tesseract", [
      inputPath, outputBase,
      "--oem", "1",
      "--psm", "8",
      "-c", `tessedit_char_whitelist=${whitelist}`,
    ], { stdio: "pipe", timeout: 10000 });

    const result = readFileSync(`${outputBase}.txt`, "utf-8").trim();
    return result;
  } finally {
    try { unlinkSync(inputPath); } catch {}
    try { unlinkSync(`${outputBase}.txt`); } catch {}
  }
}

/**
 * Solve eCourts text CAPTCHA for free.
 * Returns 5 lowercase alphanumeric chars or null.
 */
export async function solveCaptchaFree(imageBuffer: Buffer): Promise<string | null> {
  if (!hasTesseract()) return null;

  try {
    const processed = await preprocessCaptcha(imageBuffer);
    const raw = runTesseract(processed, "abcdefghijklmnopqrstuvwxyz0123456789");
    const cleaned = raw.toLowerCase().replace(/[^a-z0-9]/g, "");

    if (cleaned.length >= 4 && cleaned.length <= 6) {
      const result = cleaned.substring(0, 5);
      console.log(`[Free CAPTCHA] Solved: "${raw}" → "${result}"`);
      return result;
    }

    console.warn(`[Free CAPTCHA] Failed: "${raw}" → "${cleaned}" (${cleaned.length} chars)`);
    return null;
  } catch (error) {
    console.error("[Free CAPTCHA] Error:", error);
    return null;
  }
}

/**
 * Solve SC math CAPTCHA for free.
 * SC shows "6 + 4" or "9 - 3" — OCR reads digits and operator.
 */
export async function solveMathCaptchaFree(imageBuffer: Buffer): Promise<string | null> {
  if (!hasTesseract()) return null;

  try {
    const processed = await sharp(imageBuffer)
      .greyscale()
      .threshold(128)
      .resize({ width: 300, height: 80, fit: "fill" })
      .sharpen()
      .png()
      .toBuffer();

    const raw = runTesseract(processed, "0123456789+- ");
    const mathMatch = raw.match(/(\d+)\s*([+-])\s*(\d+)/);

    if (mathMatch) {
      const a = parseInt(mathMatch[1]);
      const op = mathMatch[2];
      const b = parseInt(mathMatch[3]);
      const result = op === "+" ? a + b : a - b;
      console.log(`[Free CAPTCHA] Math: ${a} ${op} ${b} = ${result}`);
      return String(result);
    }

    console.warn(`[Free CAPTCHA] Math failed: "${raw}"`);
    return null;
  } catch (error) {
    console.error("[Free CAPTCHA] Math error:", error);
    return null;
  }
}
