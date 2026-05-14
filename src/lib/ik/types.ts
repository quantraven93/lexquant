/**
 * Indian Kanoon /doc/<tid>/ API response + parsed research view shapes.
 *
 * IK auto-classifies paragraphs by role via a `data-structure` attribute
 * on each <p> tag inside the `doc` HTML. We surface those classifications
 * as separate panels in the research view.
 */

export interface IKDocResponse {
  tid: number;
  title: string;
  publishdate: string | null;
  docsource: string;
  divtype: string | null;
  doc: string;
  numcites: number;
  numcitedby: number;
  citetid?: number;
  courtcopy?: boolean;
  cats?: Array<{ formInput: string; value: string }>;
  relatedqs?: Array<{ formInput: string; value: string }>;
}

export const IK_STRUCTURE_TYPES = [
  "Facts",
  "Issue",
  "PetArg",
  "RespArg",
  "Precedent",
  "Section",
  "CDiscource",
  "Conclusion",
  "Other",
] as const;

export type IKStructureType = (typeof IK_STRUCTURE_TYPES)[number];

export const IK_STRUCTURE_LABELS: Record<IKStructureType, string> = {
  Facts: "Facts",
  Issue: "Issues Framed",
  PetArg: "Petitioner's Arguments",
  RespArg: "Respondent's Arguments",
  Precedent: "Precedents Cited",
  Section: "Statutory References",
  CDiscource: "Court's Reasoning",
  Conclusion: "Held / Conclusion",
  Other: "Other",
};

/** Render order on the research view — Facts first, Conclusion last. */
export const IK_STRUCTURE_RENDER_ORDER: IKStructureType[] = [
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

export interface ParsedResearchView {
  tid: number;
  title: string;
  publishdate: string | null;
  court: string;
  author: string | null;
  bench: string[];
  numcites: number;
  numcitedby: number;
  sourceUrl: string;
  /** Map of data-structure type → ordered paragraphs of that type. */
  sections: Record<IKStructureType, string[]>;
  /** Flat plain text of the entire judgment (for full-text fallback). */
  fullText: string;
  /** Length of the original HTML doc returned by IK. */
  docLength: number;
}
