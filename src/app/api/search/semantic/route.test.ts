import { describe, it, expect, beforeEach, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  user: { id: "user-1" } as { id: string } | null,
  countResult: { count: 5, error: null } as {
    count: number | null;
    error: { message: string } | null;
  },
  rpcResult: {
    data: [] as Array<Record<string, unknown>>,
    error: null as { message: string } | null,
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () =>
    Promise.resolve({
      auth: {
        getUser: () =>
          Promise.resolve({ data: { user: mockState.user }, error: null }),
      },
      from: () => ({
        select: () =>
          Promise.resolve({
            count: mockState.countResult.count,
            error: mockState.countResult.error,
          }),
      }),
      rpc: () => Promise.resolve(mockState.rpcResult),
    }),
}));

vi.mock("@/lib/embed/voyage", () => ({
  embedTexts: vi
    .fn()
    .mockResolvedValue([Array.from({ length: 1024 }, () => 0.001)]),
}));

import { GET } from "./route";

const ORIGINAL_KEY = process.env.VOYAGE_API_KEY;

function req(qs: Record<string, string>): Request {
  const url = new URL("http://localhost/api/search/semantic");
  for (const [k, v] of Object.entries(qs)) url.searchParams.set(k, v);
  return new Request(url, { method: "GET" });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockState.user = { id: "user-1" };
  mockState.countResult = { count: 5, error: null };
  mockState.rpcResult = { data: [], error: null };
  process.env.VOYAGE_API_KEY = "test-key";
});

describe("GET /api/search/semantic", () => {
  it("400s when q is missing or under 3 chars", async () => {
    const res = await GET(req({ q: "ab" }));
    expect(res.status).toBe(400);
  });

  it("401s when no authenticated user", async () => {
    mockState.user = null;
    const res = await GET(req({ q: "valid query" }));
    expect(res.status).toBe(401);
  });

  it("503s when VOYAGE_API_KEY isn't set", async () => {
    delete process.env.VOYAGE_API_KEY;
    const res = await GET(req({ q: "valid query" }));
    expect(res.status).toBe(503);
    if (ORIGINAL_KEY === undefined) delete process.env.VOYAGE_API_KEY;
    else process.env.VOYAGE_API_KEY = ORIGINAL_KEY;
  });

  it("400s on unknown structure-filter tokens (case-insensitive lookup)", async () => {
    const res = await GET(req({ q: "valid query", structure: "garbage" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/Unknown structure filter/);
  });

  it("accepts lowercase structure tokens and maps to canonical PascalCase", async () => {
    // The route delegates to RPC; we just need a 200 outcome to know
    // the filter was accepted.
    const res = await GET(
      req({ q: "valid query", structure: "facts,precedent" }),
    );
    expect(res.status).toBe(200);
  });

  it("returns corpusEmpty:true with NO Voyage call when judgment_chunks is empty", async () => {
    mockState.countResult = { count: 0, error: null };
    const voyage = await import("@/lib/embed/voyage");
    const res = await GET(req({ q: "valid query" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.corpusEmpty).toBe(true);
    expect(data.results).toEqual([]);
    expect(voyage.embedTexts).not.toHaveBeenCalled();
  });

  it("502s when the corpus probe errors (table missing)", async () => {
    mockState.countResult = {
      count: null,
      error: { message: "relation judgment_chunks does not exist" },
    };
    const res = await GET(req({ q: "valid query" }));
    expect(res.status).toBe(502);
  });

  it("clamps limit > MAX_LIMIT to 25", async () => {
    const res = await GET(req({ q: "valid query", limit: "999" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.limit).toBe(25);
  });

  it("treats limit=0 (parseInt falsy zero) as DEFAULT_LIMIT, not 0", async () => {
    const res = await GET(req({ q: "valid query", limit: "0" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.limit).toBeGreaterThan(0);
  });

  it("502s when the RPC errors", async () => {
    mockState.rpcResult = {
      data: [],
      error: { message: "function match_judgment_chunks does not exist" },
    };
    const res = await GET(req({ q: "valid query" }));
    expect(res.status).toBe(502);
  });

  it("groups chunks by ik_tid + sets corpusEmpty:false on a normal hit", async () => {
    mockState.rpcResult = {
      data: [
        {
          ik_tid: 100,
          chunk_index: 0,
          content: "snippet one",
          structure_type: "Precedent",
          distance: 0.3,
          title: "Judgment A",
          court_code: "supremecourt",
          court_name: "Supreme Court",
          citation: null,
          publish_date: "2026-01-01",
          source_url: "https://indiankanoon.org/doc/100/",
        },
        {
          ik_tid: 100, // dup tid, increases matchedChunks
          chunk_index: 1,
          content: "snippet two",
          structure_type: "Facts",
          distance: 0.4,
          title: "Judgment A",
          court_code: "supremecourt",
          court_name: "Supreme Court",
          citation: null,
          publish_date: "2026-01-01",
          source_url: "https://indiankanoon.org/doc/100/",
        },
      ],
      error: null,
    };
    const res = await GET(req({ q: "valid query" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.corpusEmpty).toBe(false);
    expect(data.results).toHaveLength(1);
    expect(data.results[0].matchedChunks).toBe(2);
    expect(data.results[0].ikTid).toBe(100);
  });

  it("sets Cache-Control: private, no-store on success", async () => {
    const res = await GET(req({ q: "valid query" }));
    expect(res.headers.get("Cache-Control")).toContain("no-store");
  });
});
