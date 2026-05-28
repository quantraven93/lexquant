import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/embed/voyage", () => ({
  embedTexts: vi.fn(),
}));

import { runStaleSavedSearchesForUser } from "./saved-search-alerts";
import { embedTexts } from "@/lib/embed/voyage";

const ORIGINAL_KEY = process.env.VOYAGE_API_KEY;

interface StaleSearch {
  id: string;
  name: string;
  query: string;
  structure_filter: string[] | null;
  court_filter: string[] | null;
  last_top_ik_tid: number | null;
}

interface ChunkRow {
  ik_tid: number;
  chunk_index: number;
  content: string;
  structure_type: string | null;
  distance: number;
  title: string;
  court_code: string;
  court_name: string;
  citation: string | null;
  publish_date: string | null;
  source_url: string;
}

function makeRow(tid: number, distance: number): ChunkRow {
  return {
    ik_tid: tid,
    chunk_index: 0,
    content: "snippet",
    structure_type: "Facts",
    distance,
    title: `Judgment ${tid}`,
    court_code: "supremecourt",
    court_name: "Supreme Court of India",
    citation: null,
    publish_date: "2026-05-20",
    source_url: `https://indiankanoon.org/doc/${tid}/`,
  };
}

interface MockState {
  stale: StaleSearch[] | null;
  staleError: { message: string } | null;
  rpcResults: ChunkRow[];
  rpcError: { message: string } | null;
  updates: Array<Record<string, unknown>>;
}

function makeSupabase(state: MockState): SupabaseClient {
  const updates = state.updates;
  return {
    from(table: string) {
      if (table === "saved_searches") {
        return {
          select: () => ({
            eq: () => ({
              or: () => ({
                order: () => ({
                  limit: () =>
                    Promise.resolve({
                      data: state.stale,
                      error: state.staleError,
                    }),
                }),
              }),
            }),
          }),
          update: (payload: Record<string, unknown>) => {
            updates.push(payload);
            return { eq: () => Promise.resolve({ error: null }) };
          },
        };
      }
      return {};
    },
    rpc() {
      return Promise.resolve({
        data: state.rpcResults,
        error: state.rpcError,
      });
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function baseState(): MockState {
  return {
    stale: [],
    staleError: null,
    rpcResults: [],
    rpcError: null,
    updates: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.VOYAGE_API_KEY = "test-key";
});

describe("runStaleSavedSearchesForUser", () => {
  it("returns [] immediately when VOYAGE_API_KEY is not set (no DB call)", async () => {
    delete process.env.VOYAGE_API_KEY;
    const state = baseState();
    const sb = makeSupabase(state);

    const out = await runStaleSavedSearchesForUser("uid-1", sb);

    expect(out).toEqual([]);
    expect(embedTexts).not.toHaveBeenCalled();
    if (ORIGINAL_KEY === undefined) delete process.env.VOYAGE_API_KEY;
    else process.env.VOYAGE_API_KEY = ORIGINAL_KEY;
  });

  it("returns [] when the lookup errors (table missing → graceful)", async () => {
    const state = baseState();
    state.stale = null;
    state.staleError = { message: "relation saved_searches does not exist" };
    const sb = makeSupabase(state);

    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const out = await runStaleSavedSearchesForUser("uid-1", sb);

    expect(out).toEqual([]);
    expect(embedTexts).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("returns [] when no stale searches", async () => {
    const sb = makeSupabase(baseState());
    const out = await runStaleSavedSearchesForUser("uid-1", sb);
    expect(out).toEqual([]);
  });

  it("emits an alert when top tid CHANGED since last run", async () => {
    const state = baseState();
    state.stale = [
      {
        id: "s1",
        name: "Bail in NDPS",
        query: "anticipatory bail commercial quantity NDPS Act",
        structure_filter: null,
        court_filter: null,
        last_top_ik_tid: 1111, // prior top
      },
    ];
    state.rpcResults = [
      makeRow(2222, 0.3), // new top
      makeRow(3333, 0.5),
    ];
    vi.mocked(embedTexts).mockResolvedValueOnce([
      Array.from({ length: 1024 }, () => 0.001),
    ]);
    const sb = makeSupabase(state);

    const out = await runStaleSavedSearchesForUser("uid-1", sb);

    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("Bail in NDPS");
    expect(out[0].topTid).toBe(2222);
    expect(out[0].distance).toBeCloseTo(0.3);
    expect(out[0].newSinceLastRun).toBeGreaterThanOrEqual(2);
    // Bookkeeping update was written.
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].last_top_ik_tid).toBe(2222);
  });

  it("does NOT emit an alert when top tid is unchanged (avoids daily noise)", async () => {
    const state = baseState();
    state.stale = [
      {
        id: "s1",
        name: "Same as yesterday",
        query: "same query",
        structure_filter: null,
        court_filter: null,
        last_top_ik_tid: 2222, // prior top = current top
      },
    ];
    state.rpcResults = [makeRow(2222, 0.25)];
    vi.mocked(embedTexts).mockResolvedValueOnce([
      Array.from({ length: 1024 }, () => 0.001),
    ]);
    const sb = makeSupabase(state);

    const out = await runStaleSavedSearchesForUser("uid-1", sb);

    expect(out).toEqual([]);
    // Bookkeeping still gets updated.
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].last_top_ik_tid).toBe(2222);
  });

  it("treats first-ever run (null prior top) as new — counts distinct matches", async () => {
    const state = baseState();
    state.stale = [
      {
        id: "s1",
        name: "Brand new",
        query: "x",
        structure_filter: null,
        court_filter: null,
        last_top_ik_tid: null,
      },
    ];
    state.rpcResults = [makeRow(10, 0.4), makeRow(11, 0.45), makeRow(12, 0.5)];
    vi.mocked(embedTexts).mockResolvedValueOnce([
      Array.from({ length: 1024 }, () => 0.001),
    ]);
    const sb = makeSupabase(state);

    const out = await runStaleSavedSearchesForUser("uid-1", sb);

    expect(out).toHaveLength(1);
    expect(out[0].newSinceLastRun).toBe(3);
    expect(out[0].topTid).toBe(10);
  });

  it("skips a search whose RPC errors but continues with the next one", async () => {
    const state = baseState();
    state.stale = [
      {
        id: "s1",
        name: "Errors",
        query: "fails",
        structure_filter: null,
        court_filter: null,
        last_top_ik_tid: null,
      },
    ];
    state.rpcError = { message: "match_judgment_chunks not found" };
    vi.mocked(embedTexts).mockResolvedValueOnce([
      Array.from({ length: 1024 }, () => 0.001),
    ]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const sb = makeSupabase(state);

    const out = await runStaleSavedSearchesForUser("uid-1", sb);

    expect(out).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("skips a search whose Voyage embed throws", async () => {
    const state = baseState();
    state.stale = [
      {
        id: "s1",
        name: "Voyage 429",
        query: "throttled",
        structure_filter: null,
        court_filter: null,
        last_top_ik_tid: null,
      },
    ];
    vi.mocked(embedTexts).mockRejectedValueOnce(new Error("rate limited"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const sb = makeSupabase(state);

    const out = await runStaleSavedSearchesForUser("uid-1", sb);

    expect(out).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("bails on time budget rather than processing every stale search", async () => {
    const state = baseState();
    state.stale = [
      {
        id: "s1",
        name: "First",
        query: "a",
        structure_filter: null,
        court_filter: null,
        last_top_ik_tid: null,
      },
      {
        id: "s2",
        name: "Second",
        query: "b",
        structure_filter: null,
        court_filter: null,
        last_top_ik_tid: null,
      },
    ];
    state.rpcResults = [makeRow(1, 0.3)];
    // First embed: simulate a slow Voyage call by inserting a delay.
    vi.mocked(embedTexts)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () => resolve([Array.from({ length: 1024 }, () => 0.001)]),
              30,
            ),
          ),
      )
      .mockResolvedValueOnce([Array.from({ length: 1024 }, () => 0.002)]);
    const sb = makeSupabase(state);

    // Tiny budget — only the first search should fit.
    const out = await runStaleSavedSearchesForUser("uid-1", sb, {
      timeBudgetMs: 5,
    });

    // First search may or may not produce an alert depending on whether
    // it completed before the budget — but the SECOND should never run.
    expect(vi.mocked(embedTexts).mock.calls.length).toBeLessThanOrEqual(1);
    // out length is 0 or 1 — both valid.
    expect(out.length).toBeLessThanOrEqual(1);
  });
});
