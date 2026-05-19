/**
 * Pluggable LLM provider for the morning briefing.
 *
 * Picks the provider from LLM_PROVIDER env var (default: gemini).
 * All providers expose the same generate(prompt) signature so the
 * caller stays agnostic.
 *
 *   - gemini    : Google Gemini 2.0 Flash via REST.
 *                 Free tier: 1M tokens/day, 15 RPM, 1500 RPD.
 *                 Requires GEMINI_API_KEY.
 *   - anthropic : Claude Haiku via @anthropic-ai/sdk (already a dep).
 *                 Requires ANTHROPIC_API_KEY.
 *   - ollama    : Local Ollama server (Mac mini scenario).
 *                 Requires OLLAMA_URL (e.g. https://ollama.example.com)
 *                 and optionally OLLAMA_MODEL (default 'gemma3:4b').
 */

import Anthropic from "@anthropic-ai/sdk";
import type { GeneratedBriefing, LLMProvider } from "./types";

function getProvider(): LLMProvider {
  const raw = (process.env.LLM_PROVIDER || "gemini").toLowerCase();
  if (raw === "gemini" || raw === "anthropic" || raw === "ollama") return raw;
  return "gemini";
}

async function generateGemini(prompt: string): Promise<GeneratedBriefing> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const start = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 800,
      },
    }),
    signal: AbortSignal.timeout(45_000),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Gemini HTTP ${res.status}: ${detail.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text =
    data.candidates?.[0]?.content?.parts
      ?.map((p) => p.text || "")
      .join("")
      .trim() || "";

  if (!text) throw new Error("Gemini returned empty body");

  return {
    body: text,
    provider: "gemini",
    model,
    prompt_chars: prompt.length,
    output_chars: text.length,
    duration_ms: Date.now() - start,
  };
}

async function generateAnthropic(prompt: string): Promise<GeneratedBriefing> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const model = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
  const client = new Anthropic({ apiKey });

  const start = Date.now();
  const msg = await client.messages.create({
    model,
    max_tokens: 800,
    temperature: 0.4,
    messages: [{ role: "user", content: prompt }],
  });

  const text = msg.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
  if (!text) throw new Error("Anthropic returned empty body");

  return {
    body: text,
    provider: "anthropic",
    model,
    prompt_chars: prompt.length,
    output_chars: text.length,
    duration_ms: Date.now() - start,
  };
}

async function generateOllama(prompt: string): Promise<GeneratedBriefing> {
  const baseUrl = process.env.OLLAMA_URL;
  if (!baseUrl) throw new Error("OLLAMA_URL not set");

  const model = process.env.OLLAMA_MODEL || "gemma3:4b";
  const url = baseUrl.replace(/\/$/, "") + "/api/generate";

  const start = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      options: { temperature: 0.4, num_predict: 800 },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Ollama HTTP ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = (await res.json()) as { response?: string };
  const text = (data.response || "").trim();
  if (!text) throw new Error("Ollama returned empty body");

  return {
    body: text,
    provider: "ollama",
    model,
    prompt_chars: prompt.length,
    output_chars: text.length,
    duration_ms: Date.now() - start,
  };
}

export async function generateBriefing(
  prompt: string,
): Promise<GeneratedBriefing> {
  const provider = getProvider();
  switch (provider) {
    case "gemini":
      return generateGemini(prompt);
    case "anthropic":
      return generateAnthropic(prompt);
    case "ollama":
      return generateOllama(prompt);
  }
}

export function activeProvider(): LLMProvider {
  return getProvider();
}
