/**
 * Voyage AI embeddings client — voyage-law-2 (1024d, law-tuned, 16K context).
 *
 * https://docs.voyageai.com/reference/embeddings-api
 *
 * Single batched embed call. Caller is responsible for keeping batches
 * within Voyage's per-request limits (128 texts, ~120K tokens / batch
 * for `voyage-law-2`). We retry once on 429 / 5xx with a fixed backoff —
 * anything more elaborate is overkill at current corpus size.
 */

const VOYAGE_API = "https://api.voyageai.com/v1/embeddings";
const MODEL = "voyage-law-2";
const DIM = 1024;

export type VoyageInputType = "document" | "query";

interface VoyageResponse {
  data: Array<{ embedding: number[]; index: number }>;
  model: string;
  usage: { total_tokens: number };
}

export async function embedTexts(
  texts: string[],
  inputType: VoyageInputType,
): Promise<number[][]> {
  if (!texts.length) return [];
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) throw new Error("VOYAGE_API_KEY not set");

  const body = JSON.stringify({
    input: texts,
    model: MODEL,
    input_type: inputType,
    truncation: true,
  });

  let lastErr = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(VOYAGE_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body,
      signal: AbortSignal.timeout(60_000),
    });
    if (res.ok) {
      const data = (await res.json()) as VoyageResponse;
      const sorted = [...data.data].sort((a, b) => a.index - b.index);
      const out = sorted.map((d) => d.embedding);
      for (const v of out) {
        if (v.length !== DIM) {
          throw new Error(
            `Voyage returned dim=${v.length}, expected ${DIM} for ${MODEL}`,
          );
        }
      }
      return out;
    }
    lastErr = `HTTP ${res.status}: ${await res.text().catch(() => "")}`;
    if (res.status !== 429 && res.status < 500) break;
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`Voyage embed failed: ${lastErr}`);
}

export const VOYAGE_MODEL = MODEL;
export const VOYAGE_DIM = DIM;
