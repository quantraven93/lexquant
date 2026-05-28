import { describe, it, expect } from "vitest";
import { chunkResearchView } from "./chunker";
import type { ParsedResearchView } from "@/lib/ik/types";

function emptyView(): ParsedResearchView {
  return {
    tid: 1,
    title: "Test",
    publishdate: "2026-01-01",
    court: "Supreme Court",
    author: null,
    bench: [],
    numcites: 0,
    numcitedby: 0,
    sourceUrl: "https://indiankanoon.org/doc/1/",
    sections: {
      Facts: [],
      Issue: [],
      PetArg: [],
      RespArg: [],
      Precedent: [],
      Section: [],
      CDiscource: [],
      Conclusion: [],
      Other: [],
    },
    fullText: "",
    docLength: 0,
    cites: [],
    citedBy: [],
  };
}

describe("chunkResearchView", () => {
  it("emits one chunk per structured paragraph in render order", () => {
    const view = emptyView();
    view.sections.Facts = [
      "The petitioner filed a writ on 2024-03-12 challenging the impugned order.",
      "The respondent denies all averments and contends the petition is misconceived.",
    ];
    view.sections.Conclusion = [
      "For the foregoing reasons, the petition stands allowed and the impugned order is set aside.",
    ];

    const chunks = chunkResearchView(view);

    expect(chunks).toHaveLength(3);
    // Render order: Facts before Conclusion.
    expect(chunks[0].structureType).toBe("Facts");
    expect(chunks[1].structureType).toBe("Facts");
    expect(chunks[2].structureType).toBe("Conclusion");
    // chunk_index monotonically increasing.
    expect(chunks.map((c) => c.chunkIndex)).toEqual([0, 1, 2]);
  });

  it("preserves the structure tag on every chunk", () => {
    const view = emptyView();
    view.sections.Precedent = [
      "Reliance is placed on the decision in State of UP v Singhara Singh.",
    ];
    view.sections.Section = [
      "Reference is made to Section 482 of the CrPC dealing with inherent powers of the High Court.",
    ];

    const chunks = chunkResearchView(view);

    const types = chunks.map((c) => c.structureType);
    expect(types).toContain("Precedent");
    expect(types).toContain("Section");
  });

  it("skips paragraphs shorter than the MIN_CHUNK_CHARS guard", () => {
    const view = emptyView();
    view.sections.Facts = [
      "Short.", // < 60 chars — should be dropped.
      "This paragraph is long enough to clear the sixty-character minimum threshold so it should survive.",
    ];

    const chunks = chunkResearchView(view);

    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toMatch(/^This paragraph/);
  });

  it("splits oversized paragraphs without dropping the tail", () => {
    const view = emptyView();
    // Build a paragraph well over MAX_CHUNK_CHARS=6000 with sentence breaks.
    const sentence = "This is a sentence that ends in a period. ";
    const longPara = sentence.repeat(200); // ~8400 chars, ~200 sentences.
    view.sections.CDiscource = [longPara];

    const chunks = chunkResearchView(view);

    expect(chunks.length).toBeGreaterThan(1);
    // No piece exceeds the cap.
    for (const c of chunks) {
      expect(c.content.length).toBeLessThanOrEqual(6000);
    }
    // Combined length is at least the original (could be more if sentence
    // splits add overlap-free joins). Importantly, NO content is lost.
    const combined = chunks.map((c) => c.content).join(" ");
    expect(combined.length).toBeGreaterThanOrEqual(longPara.length - 10);
  });

  it("hard-splits a single sentence longer than the limit (no silent tail drop)", () => {
    const view = emptyView();
    // One sentence with no terminators inside — single string of 12000 chars.
    const oneSentence = "x".repeat(12000);
    view.sections.Other = [oneSentence];
    // Use the fullText fallback path since Other-only doesn't count as
    // "structured" — set fullText with the same content.
    view.fullText = oneSentence;

    const chunks = chunkResearchView(view);

    expect(chunks.length).toBeGreaterThanOrEqual(2);
    const combined = chunks.map((c) => c.content).join("");
    // All 12000 chars must be preserved across chunks (hardSplit guarantee).
    expect(combined.length).toBeGreaterThanOrEqual(12000);
  });

  it("falls back to fullText split when no structured paragraphs exist", () => {
    const view = emptyView();
    view.fullText =
      "Paragraph one with some content.\n\n" +
      "Paragraph two also has content.\n\n" +
      "Paragraph three rounds it out with enough characters to clear the minimum.";

    const chunks = chunkResearchView(view);

    expect(chunks.length).toBeGreaterThanOrEqual(1);
    // All chunks tagged Other when we go through the fullText fallback.
    expect(chunks.every((c) => c.structureType === "Other")).toBe(true);
  });

  it("returns empty when nothing usable is present", () => {
    const view = emptyView();
    // No sections, no fullText.
    expect(chunkResearchView(view)).toEqual([]);
  });

  it("computes a positive token estimate per chunk", () => {
    const view = emptyView();
    view.sections.Facts = [
      "A paragraph with at least sixty characters of meaningful prose to clear the floor.",
    ];

    const [chunk] = chunkResearchView(view);

    expect(chunk.tokenCount).toBeGreaterThan(0);
    // Token estimate is content.length / 4 rounded up.
    expect(chunk.tokenCount).toBe(Math.ceil(chunk.content.length / 4));
  });
});
