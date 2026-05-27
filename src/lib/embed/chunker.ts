/**
 * IK research view → embedding chunks.
 *
 * One IK-classified paragraph maps to one chunk. The IK `data-structure`
 * tag travels along so retrieval can filter by role (Facts / Precedent / etc.).
 *
 * For judgments IK has not paragraph-classified, we fall back to splitting
 * `fullText` on blank-line boundaries with a soft length cap, tagging
 * everything as `Other`.
 */

import type { IKStructureType, ParsedResearchView } from "@/lib/ik/types";

export interface JudgmentChunk {
  chunkIndex: number;
  content: string;
  structureType: IKStructureType;
  tokenCount: number;
}

const MIN_CHUNK_CHARS = 60;
const MAX_CHUNK_CHARS = 6000;
const FALLBACK_SOFT_LIMIT = 1800;

function estimateTokens(s: string): number {
  return Math.ceil(s.length / 4);
}

function splitOversized(p: string, limit: number): string[] {
  if (p.length <= limit) return [p];
  const parts: string[] = [];
  const sentences = p.split(/(?<=[.?!])\s+/);
  let buf = "";
  for (const s of sentences) {
    if (buf.length + s.length + 1 <= limit) {
      buf = buf ? buf + " " + s : s;
    } else {
      if (buf) parts.push(buf);
      buf = s.length > limit ? s.slice(0, limit) : s;
    }
  }
  if (buf) parts.push(buf);
  return parts;
}

function fallbackSplit(text: string): string[] {
  const paragraphs = text
    .split(/\n{2,}|\r\n\r\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (paragraphs.length > 1) return paragraphs;
  // Single-block text — sliding split on sentences.
  return splitOversized(text, FALLBACK_SOFT_LIMIT);
}

export function chunkResearchView(view: ParsedResearchView): JudgmentChunk[] {
  const out: JudgmentChunk[] = [];
  let chunkIndex = 0;

  const renderOrder: IKStructureType[] = [
    "Facts",
    "Issue",
    "PetArg",
    "RespArg",
    "Section",
    "Precedent",
    "CDiscource",
    "Conclusion",
    "Other",
  ];

  let hasStructured = false;
  for (const t of renderOrder) {
    if (t === "Other") continue;
    if (view.sections[t].length > 0) {
      hasStructured = true;
      break;
    }
  }

  if (hasStructured) {
    for (const t of renderOrder) {
      for (const p of view.sections[t]) {
        if (p.length < MIN_CHUNK_CHARS) continue;
        for (const piece of splitOversized(p, MAX_CHUNK_CHARS)) {
          out.push({
            chunkIndex: chunkIndex++,
            content: piece,
            structureType: t,
            tokenCount: estimateTokens(piece),
          });
        }
      }
    }
  } else if (view.fullText) {
    for (const piece of fallbackSplit(view.fullText)) {
      if (piece.length < MIN_CHUNK_CHARS) continue;
      for (const sub of splitOversized(piece, MAX_CHUNK_CHARS)) {
        out.push({
          chunkIndex: chunkIndex++,
          content: sub,
          structureType: "Other",
          tokenCount: estimateTokens(sub),
        });
      }
    }
  }

  return out;
}
