/**
 * Fetches a single Indian Kanoon judgment by tid and parses it into a
 * structured research view (Facts / Issues / Arguments / Precedents /
 * Sections / Reasoning / Held), using IK's own data-structure paragraph
 * classifications. Falls back to raw text when IK has not classified.
 */

import { parse } from "node-html-parser";
import {
  IK_STRUCTURE_TYPES,
  type IKDocResponse,
  type IKStructureType,
  type ParsedResearchView,
} from "./types";

const IK_API_BASE = "https://api.indiankanoon.org";

function isStructureType(s: string): s is IKStructureType {
  return (IK_STRUCTURE_TYPES as readonly string[]).includes(s);
}

export async function fetchIKDoc(tid: number): Promise<IKDocResponse> {
  const apiKey = process.env.IK_API_KEY;
  if (!apiKey) throw new Error("IK_API_KEY not set");
  if (!Number.isFinite(tid) || tid <= 0) {
    throw new Error("Invalid tid");
  }

  const res = await fetch(`${IK_API_BASE}/doc/${tid}/`, {
    method: "POST",
    // Empty body forces Content-Length: 0 — without this header IK
    // returns a schema description instead of the document payload.
    body: "",
    headers: { Authorization: `Token ${apiKey}` },
    signal: AbortSignal.timeout(45_000),
  });

  if (!res.ok) {
    throw new Error(`IK doc API failed: HTTP ${res.status}`);
  }

  const data = (await res.json()) as IKDocResponse;
  if (!data.tid || typeof data.doc !== "string") {
    throw new Error("IK returned malformed doc payload");
  }
  return data;
}

function stripEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseIKDoc(raw: IKDocResponse): ParsedResearchView {
  const root = parse(raw.doc, {
    lowerCaseTagName: false,
    blockTextElements: { script: false, style: false, pre: true },
  });

  const authorEl =
    root.querySelector("h3.doc_author a") ||
    root.querySelector("h3.doc_author");
  const author = authorEl
    ? stripEntities(authorEl.text).replace(/^Author:\s*/i, "") || null
    : null;

  const benchEls = root.querySelectorAll("h3.doc_bench a");
  const bench = benchEls
    .map((e) => stripEntities(e.text))
    .filter((s) => s.length > 0 && s.toLowerCase() !== "bench:");

  const sections: Record<IKStructureType, string[]> = {
    Facts: [],
    Issue: [],
    PetArg: [],
    RespArg: [],
    Precedent: [],
    Section: [],
    CDiscource: [],
    Conclusion: [],
    Other: [],
  };

  for (const p of root.querySelectorAll("p[data-structure]")) {
    const rawType = p.getAttribute("data-structure") || "";
    const text = stripEntities(p.text);
    if (!text) continue;
    if (isStructureType(rawType)) {
      sections[rawType].push(text);
    } else {
      sections.Other.push(text);
    }
  }

  const fullText = stripEntities(root.text);

  return {
    tid: raw.tid,
    title: stripEntities(raw.title || ""),
    publishdate: raw.publishdate,
    court: raw.docsource || "",
    author,
    bench,
    numcites: raw.numcites || 0,
    numcitedby: raw.numcitedby || 0,
    sourceUrl: `https://indiankanoon.org/doc/${raw.tid}/`,
    sections,
    fullText,
    docLength: raw.doc.length,
  };
}

export async function getResearchView(
  tid: number,
): Promise<ParsedResearchView> {
  const raw = await fetchIKDoc(tid);
  return parseIKDoc(raw);
}
