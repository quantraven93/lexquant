/**
 * Fetches a single Indian Kanoon judgment by tid and parses it into a
 * structured research view (Facts / Issues / Arguments / Precedents /
 * Sections / Reasoning / Held), using IK's own data-structure paragraph
 * classifications. Falls back to raw text when IK has not classified.
 */

import { parse } from "node-html-parser";
import {
  IK_STRUCTURE_TYPES,
  type IKCitation,
  type IKDocResponse,
  type IKStructureType,
  type ParsedResearchView,
} from "./types";

const IK_API_BASE = "https://api.indiankanoon.org";

const MAX_CITES = 20;
const MAX_CITED_BY = 20;

function isStructureType(s: string): s is IKStructureType {
  return (IK_STRUCTURE_TYPES as readonly string[]).includes(s);
}

export async function fetchIKDoc(tid: number): Promise<IKDocResponse> {
  const apiKey = process.env.IK_API_KEY;
  if (!apiKey) throw new Error("IK_API_KEY not set");
  if (!Number.isFinite(tid) || tid <= 0) {
    throw new Error("Invalid tid");
  }

  const url = `${IK_API_BASE}/doc/${tid}/?maxcites=${MAX_CITES}&maxcitedby=${MAX_CITED_BY}`;
  const res = await fetch(url, {
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

function normalizeCitations(arr: unknown): IKCitation[] {
  if (!Array.isArray(arr)) return [];
  const out: IKCitation[] = [];
  for (const c of arr) {
    if (typeof c !== "object" || c === null) continue;
    const r = c as Record<string, unknown>;
    const tid = typeof r.tid === "number" ? r.tid : Number(r.tid);
    if (!Number.isFinite(tid) || tid <= 0) continue;
    const entry: IKCitation = {
      tid,
      title: typeof r.title === "string" ? r.title : "",
    };
    if (typeof r.docsource === "string") entry.docsource = r.docsource;
    if (typeof r.citetext === "string") entry.citetext = r.citetext;
    if (typeof r.publishdate === "string") entry.publishdate = r.publishdate;
    out.push(entry);
  }
  return out;
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
  const cites = normalizeCitations(raw.cites);
  const citedBy = normalizeCitations(raw.citedby);

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
    cites,
    citedBy,
  };
}

export async function getResearchView(
  tid: number,
): Promise<ParsedResearchView> {
  const raw = await fetchIKDoc(tid);
  return parseIKDoc(raw);
}
