import { describe, it, expect, beforeEach, vi } from "vitest";

// Hoisted mocks — these must run BEFORE the module-under-test is imported.
const supabaseMock = vi.hoisted(() => {
  const upsertSpy = vi.fn().mockResolvedValue({ error: null });
  const updateSpy = vi.fn().mockResolvedValue({ error: null });
  const deleteSpy = vi.fn().mockResolvedValue({ error: null });
  // Lookup is configured per-test by re-assigning lookupResolver.
  // Typed as the union of all shapes our tests use so reassignment to
  // `{ data: null }` or `{ data: { chunks_at: "..." } }` doesn't trip
  // strict literal narrowing on the initial value.
  type LookupResult = {
    data: { chunks_at: string | null } | null;
    error: { message: string } | null;
  };
  const lookupResolver: { value: Promise<LookupResult> } = {
    value: Promise.resolve({ data: { chunks_at: null }, error: null }),
  };

  function from(table: string) {
    if (table === "judgments") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => lookupResolver.value,
          }),
        }),
        update: (...args: unknown[]) => {
          updateSpy(...args);
          return { eq: () => Promise.resolve({ error: null }) };
        },
      };
    }
    // judgment_chunks
    return {
      upsert: (...args: unknown[]) => upsertSpy(...args),
      delete: (...args: unknown[]) => {
        deleteSpy(...args);
        return { eq: () => Promise.resolve({ error: null }) };
      },
    };
  }

  return { upsertSpy, updateSpy, deleteSpy, lookupResolver, from };
});

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: supabaseMock.from }),
}));

vi.mock("@/lib/ik/doc", () => ({
  getResearchView: vi.fn(),
}));

vi.mock("./voyage", () => ({
  embedTexts: vi.fn(),
}));

// Import AFTER mocks are registered.
import { embedJudgment } from "./store";
import { embedTexts } from "./voyage";
import { getResearchView } from "@/lib/ik/doc";
import type { ParsedResearchView } from "@/lib/ik/types";

function viewWith(facts: string[]): ParsedResearchView {
  return {
    tid: 100,
    title: "Test",
    publishdate: "2026-01-01",
    court: "SC",
    author: null,
    bench: [],
    numcites: 0,
    numcitedby: 0,
    sourceUrl: "https://indiankanoon.org/doc/100/",
    sections: {
      Facts: facts,
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

function fakeVec() {
  return Array.from({ length: 1024 }, () => 0.001);
}

beforeEach(() => {
  vi.clearAllMocks();
  supabaseMock.lookupResolver.value = Promise.resolve({
    data: { chunks_at: null },
    error: null,
  });
});

describe("embedJudgment", () => {
  it("returns status='missing-row' when the judgments row doesn't exist (FK guard)", async () => {
    supabaseMock.lookupResolver.value = Promise.resolve({
      data: null,
      error: null,
    });

    const result = await embedJudgment(100, {
      view: viewWith([
        "paragraph long enough to clear the floor and survive chunking checks",
      ]),
    });

    expect(result.status).toBe("missing-row");
    expect(result.chunkCount).toBe(0);
    // Critically: no Voyage call was made (we bailed BEFORE paying).
    expect(embedTexts).not.toHaveBeenCalled();
  });

  it("returns status='skipped' when chunks_at is already set and force is false", async () => {
    supabaseMock.lookupResolver.value = Promise.resolve({
      data: { chunks_at: "2026-01-01T00:00:00Z" },
      error: null,
    });

    const result = await embedJudgment(100, {
      view: viewWith([
        "long enough paragraph to clear the sixty-char floor in the chunker",
      ]),
    });

    expect(result.status).toBe("skipped");
    expect(embedTexts).not.toHaveBeenCalled();
  });

  it("throws if the embeddings count doesn't match the chunk count", async () => {
    vi.mocked(embedTexts).mockResolvedValueOnce([fakeVec()]); // returns 1 vec
    const view = viewWith([
      "First chunk paragraph long enough to clear the chunker minimum floor entirely.",
      "Second chunk paragraph long enough to clear the chunker minimum floor entirely.",
    ]);

    await expect(embedJudgment(100, { view })).rejects.toThrow(
      /Voyage returned 1 embeddings for 2 chunks/,
    );
  });

  it("upserts chunks + marks chunks_at on success and returns status='embedded'", async () => {
    vi.mocked(embedTexts).mockResolvedValueOnce([fakeVec(), fakeVec()]);
    const view = viewWith([
      "First chunk paragraph long enough to clear the chunker minimum floor entirely.",
      "Second chunk paragraph long enough to clear the chunker minimum floor entirely.",
    ]);

    const result = await embedJudgment(100, { view });

    expect(result.status).toBe("embedded");
    expect(result.chunkCount).toBe(2);
    expect(supabaseMock.upsertSpy).toHaveBeenCalledTimes(1);
    // Final chunks_at marker write happened.
    expect(supabaseMock.updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ chunks_at: expect.any(String) }),
    );
  });

  it("force=true deletes existing chunks before upserting fresh", async () => {
    supabaseMock.lookupResolver.value = Promise.resolve({
      data: { chunks_at: "2026-01-01T00:00:00Z" },
      error: null,
    });
    vi.mocked(embedTexts).mockResolvedValueOnce([fakeVec()]);
    const view = viewWith([
      "Only one paragraph, long enough to clear the chunker minimum floor here.",
    ]);

    const result = await embedJudgment(100, { view, force: true });

    expect(result.status).toBe("embedded");
    expect(supabaseMock.deleteSpy).toHaveBeenCalledTimes(1);
    // Delete must run BEFORE upsert (otherwise we'd orphan rows).
    const deleteOrder = supabaseMock.deleteSpy.mock.invocationCallOrder[0];
    const upsertOrder = supabaseMock.upsertSpy.mock.invocationCallOrder[0];
    expect(deleteOrder).toBeLessThan(upsertOrder);
  });

  it("uses pre-fetched view when caller passes opts.view (no IK fetch)", async () => {
    vi.mocked(embedTexts).mockResolvedValueOnce([fakeVec()]);
    const view = viewWith([
      "A long enough paragraph to clear the chunker floor for sure now.",
    ]);

    await embedJudgment(100, { view });

    expect(getResearchView).not.toHaveBeenCalled();
  });

  it("falls back to fetching the view when opts.view is omitted", async () => {
    const view = viewWith([
      "A long enough paragraph to clear the chunker floor for sure now.",
    ]);
    vi.mocked(getResearchView).mockResolvedValueOnce(view);
    vi.mocked(embedTexts).mockResolvedValueOnce([fakeVec()]);

    await embedJudgment(100);

    expect(getResearchView).toHaveBeenCalledWith(100);
  });

  it("returns status='no-chunks' when the view contains no embeddable paragraphs", async () => {
    const result = await embedJudgment(100, {
      view: viewWith(["short"]), // < 60 chars → chunker yields nothing
    });

    expect(result.status).toBe("no-chunks");
    expect(embedTexts).not.toHaveBeenCalled();
    // Still marks chunks_at so we don't loop on this tid.
    expect(supabaseMock.updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ chunks_at: expect.any(String) }),
    );
  });
});
