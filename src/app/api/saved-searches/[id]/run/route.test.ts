import { describe, it, expect, beforeEach, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  user: { id: "user-1" } as { id: string } | null,
  savedSearch: null as Record<string, unknown> | null,
  loadError: null as { message: string } | null,
  rpcResult: {
    data: [] as Array<Record<string, unknown>>,
    error: null as { message: string } | null,
  },
  adminUpdates: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () =>
    Promise.resolve({
      auth: {
        getUser: () =>
          Promise.resolve({ data: { user: mockState.user }, error: null }),
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: mockState.savedSearch,
                  error: mockState.loadError,
                }),
            }),
          }),
        }),
      }),
      rpc: () => Promise.resolve(mockState.rpcResult),
    }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      update: (payload: Record<string, unknown>) => {
        mockState.adminUpdates.push(payload);
        return { eq: () => Promise.resolve({ error: null }) };
      },
    }),
  }),
}));

vi.mock("@/lib/embed/voyage", () => ({
  embedTexts: vi
    .fn()
    .mockResolvedValue([Array.from({ length: 1024 }, () => 0.001)]),
}));

import { POST } from "./route";

const ORIGINAL_KEY = process.env.VOYAGE_API_KEY;

function req(): Request {
  return new Request("http://localhost/api/saved-searches/abc/run", {
    method: "POST",
  });
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockState.user = { id: "user-1" };
  mockState.savedSearch = null;
  mockState.loadError = null;
  mockState.rpcResult = { data: [], error: null };
  mockState.adminUpdates = [];
  process.env.VOYAGE_API_KEY = "test-key";
});

describe("POST /api/saved-searches/[id]/run", () => {
  it("400s on empty id", async () => {
    const res = await POST(req(), ctx(""));
    expect(res.status).toBe(400);
  });

  it("401s when no authenticated user", async () => {
    mockState.user = null;
    const res = await POST(req(), ctx("abc"));
    expect(res.status).toBe(401);
  });

  it("503s when VOYAGE_API_KEY isn't set", async () => {
    delete process.env.VOYAGE_API_KEY;
    const res = await POST(req(), ctx("abc"));
    expect(res.status).toBe(503);
    if (ORIGINAL_KEY === undefined) delete process.env.VOYAGE_API_KEY;
    else process.env.VOYAGE_API_KEY = ORIGINAL_KEY;
  });

  it("404s when the saved search doesn't exist (or isn't owned)", async () => {
    mockState.savedSearch = null;
    const res = await POST(req(), ctx("missing-id"));
    expect(res.status).toBe(404);
  });

  it("502s when the load query errors", async () => {
    mockState.loadError = { message: "connection refused" };
    const res = await POST(req(), ctx("abc"));
    expect(res.status).toBe(502);
  });

  it("502s when the RPC errors", async () => {
    mockState.savedSearch = {
      id: "abc",
      name: "x",
      query: "q",
      structure_filter: null,
      court_filter: null,
      last_top_ik_tid: null,
    };
    mockState.rpcResult = {
      data: [],
      error: { message: "function match_judgment_chunks does not exist" },
    };
    const res = await POST(req(), ctx("abc"));
    expect(res.status).toBe(502);
  });

  it("returns results, updates bookkeeping, and counts newSinceRun on top-changed", async () => {
    mockState.savedSearch = {
      id: "abc",
      name: "Bail in NDPS",
      query: "anticipatory bail commercial quantity",
      structure_filter: null,
      court_filter: null,
      last_top_ik_tid: 111, // prior top
    };
    mockState.rpcResult = {
      data: [
        {
          ik_tid: 222, // new top
          chunk_index: 0,
          content: "snippet",
          structure_type: "Precedent",
          distance: 0.3,
          title: "New Judgment",
          court_code: "supremecourt",
          court_name: "Supreme Court",
          citation: null,
          publish_date: "2026-01-01",
          source_url: "https://indiankanoon.org/doc/222/",
        },
        {
          ik_tid: 333,
          chunk_index: 0,
          content: "snippet",
          structure_type: "Facts",
          distance: 0.5,
          title: "Another Judgment",
          court_code: "bombay",
          court_name: "Bombay High Court",
          citation: null,
          publish_date: "2026-01-02",
          source_url: "https://indiankanoon.org/doc/333/",
        },
      ],
      error: null,
    };
    const res = await POST(req(), ctx("abc"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.topTid).toBe(222);
    expect(data.topDistance).toBeCloseTo(0.3);
    // Both rows are NEW relative to prior top of 111.
    expect(data.newMatchesSinceRun).toBe(2);
    // Admin bookkeeping update was issued exactly once.
    expect(mockState.adminUpdates).toHaveLength(1);
    expect(mockState.adminUpdates[0]).toMatchObject({
      last_top_ik_tid: 222,
      new_matches_since_run: 2,
    });
  });

  it("returns topDistance/topTid null when results are empty", async () => {
    mockState.savedSearch = {
      id: "abc",
      name: "x",
      query: "q",
      structure_filter: null,
      court_filter: null,
      last_top_ik_tid: null,
    };
    mockState.rpcResult = { data: [], error: null };
    const res = await POST(req(), ctx("abc"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.topDistance).toBeNull();
    expect(data.topTid).toBeNull();
    expect(data.results).toEqual([]);
  });

  it("sets Cache-Control: private, no-store on success", async () => {
    mockState.savedSearch = {
      id: "abc",
      name: "x",
      query: "q",
      structure_filter: null,
      court_filter: null,
      last_top_ik_tid: null,
    };
    const res = await POST(req(), ctx("abc"));
    expect(res.headers.get("Cache-Control")).toContain("no-store");
  });
});
