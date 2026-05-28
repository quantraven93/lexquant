import { describe, it, expect, beforeEach, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  user: { id: "user-1" } as { id: string } | null,
  deleteError: null as { message: string } | null,
  deleteCalls: [] as Array<{ id: string; user_id: string }>,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () =>
    Promise.resolve({
      auth: {
        getUser: () =>
          Promise.resolve({ data: { user: mockState.user }, error: null }),
      },
      from: () => ({
        delete: () => {
          let capturedId = "";
          let capturedUser = "";
          const chain = {
            eq(field: string, value: string) {
              if (field === "id") capturedId = value;
              if (field === "user_id") capturedUser = value;
              return chain;
            },
            then(
              onFulfilled: (v: {
                error: { message: string } | null;
              }) => unknown,
            ) {
              mockState.deleteCalls.push({
                id: capturedId,
                user_id: capturedUser,
              });
              return Promise.resolve({ error: mockState.deleteError }).then(
                onFulfilled,
              );
            },
          };
          return chain;
        },
      }),
    }),
}));

import { DELETE } from "./route";

function makeRequest(): Request {
  return new Request("http://localhost/api/saved-searches/abc", {
    method: "DELETE",
  });
}

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  mockState.user = { id: "user-1" };
  mockState.deleteError = null;
  mockState.deleteCalls = [];
});

describe("DELETE /api/saved-searches/[id]", () => {
  it("400s when id is empty", async () => {
    const res = await DELETE(makeRequest(), makeContext(""));
    expect(res.status).toBe(400);
  });

  it("401s when no authenticated user", async () => {
    mockState.user = null;
    const res = await DELETE(makeRequest(), makeContext("abc"));
    expect(res.status).toBe(401);
  });

  it("deletes scoped to id AND user_id (defence in depth vs RLS)", async () => {
    const res = await DELETE(makeRequest(), makeContext("abc-id"));
    expect(res.status).toBe(200);
    expect(mockState.deleteCalls).toHaveLength(1);
    expect(mockState.deleteCalls[0]).toEqual({
      id: "abc-id",
      user_id: "user-1",
    });
  });

  it("502s when the delete errors", async () => {
    mockState.deleteError = { message: "FK constraint" };
    const res = await DELETE(makeRequest(), makeContext("abc"));
    expect(res.status).toBe(502);
  });

  it("returns { ok: true } on success", async () => {
    const res = await DELETE(makeRequest(), makeContext("abc"));
    const data = await res.json();
    expect(data).toEqual({ ok: true });
  });
});
