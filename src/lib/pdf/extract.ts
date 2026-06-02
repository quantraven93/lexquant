import { getDocumentProxy, extractText } from "unpdf";

/**
 * Fetch a PDF by URL and return its extracted text (whitespace-normalised).
 *
 * Returns "" when the PDF has no text layer (a pure scan with no OCR) so the
 * caller can skip summarising garbage. Throws on fetch/parse failure so the
 * caller can record the reason. Used to feed order PDFs into the summariser.
 */
export async function extractPdfText(
  url: string,
  timeoutMs = 15000,
): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`PDF fetch failed: ${res.status}`);

  const buf = new Uint8Array(await res.arrayBuffer());
  const pdf = await getDocumentProxy(buf);
  const { text } = await extractText(pdf, { mergePages: true });
  const merged = Array.isArray(text) ? text.join(" ") : text;
  return (merged || "").replace(/\s+/g, " ").trim();
}
