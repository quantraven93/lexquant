import { describe, it, expect, beforeEach, vi } from "vitest";

// Hoisted mock state — mutated per-test to switch auth/data outcomes.
const mockState = vi.hoisted(() => ({
  user: { id: "user-1" } as { id: string } | null,
  selectRows: [] as Array<Record<string, unknown>>,
  selectError: null as { message: string } | null,
  insertRow: null as Record<string, unknown> | null,
  insertError: null as { message: string } | null,
  insertPayloads: [] as Array<Record<string, unknown>>,
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
            order: () => ({
              order: () =>
                Promise.resolve({
                  data: mockState.selectRows,
                  error: mockState.selectError,
                }),
            }),
          }),
        }),
        insert: (payload: Record<string, unknown>) => {
          mockState.insertPayloads.push(payload);
          return {
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: mockState.insertRow,
                  error: mockState.insertError,
                }),
            }),
          };
        },
      }),
    }),
}));

// Import AFTER the mock is registered.
import { GET, POST } from "./route";

function makeRequest(body?: unknown): Request {
  return new Request("http://localhost/api/saved-searches", {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  mockState.user = { id: "user-1" };
  mockState.selectRows = [];
  mockState.selectError = null;
  mockState.insertRow = null;
  mockState.insertError = null;
  mockState.insertPayloads = [];
});

describe("GET /api/saved-searches", () => {
  it("401s when no authenticated user", async () => {
    mockState.user = null;
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns rows for the authenticated user", async () => {
    mockState.selectRows = [
      {
        id: "s1",
        name: "Bail in NDPS",
        query: "anticipatory bail commercial quantity",
        structure_filter: null,
        court_filter: null,
        created_at: "2026-05-27T00:00:00Z",
        last_run_at: null,
        last_top_distance: null,
        last_top_ik_tid: null,
        new_matches_since_run: 0,
      },
    ];
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.searches).toHaveLength(1);
    expect(data.searches[0].name).toBe("Bail in NDPS");
  });

  it("502s on DB error", async () => {
    mockState.selectError = { message: "connection refused" };
    const res = await GET();
    expect(res.status).toBe(502);
  });

  it("sets Cache-Control: private, no-store", async () => {
    const res = await GET();
    expect(res.headers.get("Cache-Control")).toContain("no-store");
  });
});

describe("POST /api/saved-searches", () => {
  it("401s when no authenticated user", async () => {
    mockState.user = null;
    const res = await POST(makeRequest({ name: "x", query: "abc" }));
    expect(res.status).toBe(401);
  });

  it("400s on invalid JSON body", async () => {
    const req = new Request("http://localhost/api/saved-searches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json {",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("400s when name is missing or empty", async () => {
    const res = await POST(makeRequest({ name: "", query: "valid query" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/Name required/i);
  });

  it("400s when name exceeds 120 chars", async () => {
    const longName = "x".repeat(121);
    const res = await POST(makeRequest({ name: longName, query: "abc" }));
    expect(res.status).toBe(400);
  });

  it("400s when query is shorter than 3 chars", async () => {
    const res = await POST(makeRequest({ name: "ok", query: "ab" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/3-800/);
  });

  it("400s when query exceeds 800 chars", async () => {
    const res = await POST(makeRequest({ name: "ok", query: "x".repeat(801) }));
    expect(res.status).toBe(400);
  });

  it("creates a row and returns 201 with the new search", async () => {
    mockState.insertRow = {
      id: "s-new",
      name: "Real query",
      query: "specific performance contract",
      structure_filter: null,
      court_filter: null,
      created_at: "2026-05-28T07:00:00Z",
      last_run_at: null,
      last_top_distance: null,
      last_top_ik_tid: null,
      new_matches_since_run: 0,
    };
    const res = await POST(
      makeRequest({
        name: "Real query",
        query: "specific performance contract",
        structureFilter: ["Precedent"],
        courtFilter: ["supremecourt"],
      }),
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.search.id).toBe("s-new");
    // Verify the insert payload was scoped to the authenticated user.
    expect(mockState.insertPayloads[0]).toMatchObject({
      user_id: "user-1",
      name: "Real query",
      query: "specific performance contract",
      structure_filter: ["Precedent"],
      court_filter: ["supremecourt"],
    });
  });

  it("502s when the insert errors", async () => {
    mockState.insertError = { message: "unique violation" };
    const res = await POST(makeRequest({ name: "X", query: "valid query" }));
    expect(res.status).toBe(502);
  });

  it("sanitises non-string filter array entries", async () => {
    mockState.insertRow = {
      id: "s1",
      name: "x",
      query: "valid query",
      structure_filter: ["Precedent"],
      court_filter: null,
      created_at: "x",
      last_run_at: null,
      last_top_distance: null,
      last_top_ik_tid: null,
      new_matches_since_run: 0,
    };
    await POST(
      makeRequest({
        name: "x",
        query: "valid query",
        // Mixed garbage — only the string survives.
        structureFilter: ["Precedent", 123, null, "", { x: 1 }],
        courtFilter: "not-an-array",
      }),
    );
    const payload = mockState.insertPayloads[0];
    expect(payload.structure_filter).toEqual(["Precedent"]);
    expect(payload.court_filter).toBeNull();
  });
});
