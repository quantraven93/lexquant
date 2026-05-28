import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { embedTexts, VOYAGE_DIM } from "./voyage";

const ORIGINAL_FETCH = global.fetch;
const ORIGINAL_KEY = process.env.VOYAGE_API_KEY;

function fakeEmbedding(dim = VOYAGE_DIM): number[] {
  return Array.from({ length: dim }, (_, i) => (i % 7) * 0.001);
}

function mockFetchOk(payload: unknown): typeof global.fetch {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(payload),
  } as Response);
}

beforeEach(() => {
  process.env.VOYAGE_API_KEY = "test-key";
});

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
  if (ORIGINAL_KEY === undefined) delete process.env.VOYAGE_API_KEY;
  else process.env.VOYAGE_API_KEY = ORIGINAL_KEY;
  vi.restoreAllMocks();
});

describe("embedTexts", () => {
  it("short-circuits on empty input without hitting the API", async () => {
    const spy = vi.fn();
    global.fetch = spy;

    const out = await embedTexts([], "document");

    expect(out).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("throws when VOYAGE_API_KEY is not set", async () => {
    delete process.env.VOYAGE_API_KEY;
    await expect(embedTexts(["hello"], "query")).rejects.toThrow(
      /VOYAGE_API_KEY/,
    );
  });

  it("returns vectors in input index order even if API returns shuffled", async () => {
    const v0 = fakeEmbedding();
    const v1 = fakeEmbedding();
    const v2 = fakeEmbedding();
    v0[0] = 0.1;
    v1[0] = 0.2;
    v2[0] = 0.3;
    global.fetch = mockFetchOk({
      // Shuffled order — embedTexts must sort by `index` before returning.
      data: [
        { index: 2, embedding: v2 },
        { index: 0, embedding: v0 },
        { index: 1, embedding: v1 },
      ],
      model: "voyage-law-2",
      usage: { total_tokens: 9 },
    });

    const out = await embedTexts(["a", "b", "c"], "document");

    expect(out).toHaveLength(3);
    expect(out[0][0]).toBeCloseTo(0.1);
    expect(out[1][0]).toBeCloseTo(0.2);
    expect(out[2][0]).toBeCloseTo(0.3);
  });

  it("throws when a returned embedding has the wrong dimension", async () => {
    const badVec = Array.from({ length: 512 }, () => 0); // wrong dim
    global.fetch = mockFetchOk({
      data: [{ index: 0, embedding: badVec }],
      model: "voyage-law-2",
      usage: { total_tokens: 1 },
    });

    await expect(embedTexts(["one"], "document")).rejects.toThrow(
      /dim=512.*expected 1024/,
    );
  });

  it("retries once on 429 then succeeds", async () => {
    let calls = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      calls++;
      if (calls === 1) {
        return Promise.resolve({
          ok: false,
          status: 429,
          text: () => Promise.resolve("rate limited"),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            data: [{ index: 0, embedding: fakeEmbedding() }],
            model: "voyage-law-2",
            usage: { total_tokens: 1 },
          }),
      } as Response);
    });

    const out = await embedTexts(["retry me"], "query");
    expect(out).toHaveLength(1);
    expect(calls).toBe(2);
  }, 10_000);

  it("does NOT retry on a 4xx (other than 429) and surfaces the error", async () => {
    let calls = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      calls++;
      return Promise.resolve({
        ok: false,
        status: 400,
        text: () => Promise.resolve("bad request"),
      } as Response);
    });

    await expect(embedTexts(["x"], "document")).rejects.toThrow(/HTTP 400/);
    expect(calls).toBe(1);
  });

  it("warns when a long query exceeds the truncation threshold", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    global.fetch = mockFetchOk({
      data: [{ index: 0, embedding: fakeEmbedding() }],
      model: "voyage-law-2",
      usage: { total_tokens: 1 },
    });

    const longQuery = "x".repeat(70_000);
    await embedTexts([longQuery], "query");

    expect(warn).toHaveBeenCalled();
    const warnArg = String(warn.mock.calls[0][0]);
    expect(warnArg).toMatch(/query length=70000/);
  });

  it("does NOT warn on long documents (chunker pre-bounds those)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    global.fetch = mockFetchOk({
      data: [{ index: 0, embedding: fakeEmbedding() }],
      model: "voyage-law-2",
      usage: { total_tokens: 1 },
    });

    await embedTexts(["x".repeat(70_000)], "document");

    expect(warn).not.toHaveBeenCalled();
  });
});
