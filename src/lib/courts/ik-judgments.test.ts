import { describe, it, expect, vi, afterEach } from "vitest";

import {
  IK_COURTS,
  IK_DOCSOURCE,
  attributeDocs,
  parseFoundTotal,
  IK_PAGE_SIZE,
  fetchJudgmentsForCourt,
  fetchJudgmentsForAllCourts,
  type IKCourtCode,
} from "./ik-judgments";
import type { IKDoc } from "./judgment-types";

function doc(over: Partial<IKDoc> = {}): IKDoc {
  return {
    tid: 1,
    title: "A vs B",
    docsource: "Bombay High Court",
    publishdate: "2026-09-02",
    ...over,
  };
}

/** A full page as IK returns it: ten documents, all one docsource. */
function page(docsource: string, n = 10): IKDoc[] {
  return Array.from({ length: n }, (_, i) => doc({ tid: i + 1, docsource }));
}

describe("IK_DOCSOURCE", () => {
  it("covers every court code, so no code can skip the guard", () => {
    const codes = Object.keys(IK_COURTS) as IKCourtCode[];
    for (const code of codes) {
      expect(IK_DOCSOURCE[code], `no docsource mapped for ${code}`).toBeTruthy();
    }
  });

  it("has no 'bangalore' code — it was never a valid IK doctype", () => {
    expect(Object.keys(IK_COURTS)).not.toContain("bangalore");
    expect(Object.keys(IK_COURTS)).toContain("karnataka");
  });
});

describe("attributeDocs", () => {
  it("passes a page that is entirely the requested court", () => {
    const docs = page("Bombay High Court");
    expect(attributeDocs("bombay", docs)).toEqual(docs);
  });

  it("rejects the unfiltered fallback an invalid doctype produces", () => {
    // The exact shape the invalid `doctypes:bangalore` returned on
    // 2026-09-07: ten real judgments from four unrelated courts, none of
    // them Karnataka. Stamping these is what mislabelled 811 rows.
    const docs = [
      doc({ tid: 1, docsource: "Madhya Pradesh High Court" }),
      doc({ tid: 2, docsource: "Andhra Pradesh High Court - Amravati" }),
      doc({ tid: 3, docsource: "Chattisgarh High Court" }),
      doc({ tid: 4, docsource: "Gauhati High Court" }),
    ];
    expect(() => attributeDocs("karnataka", docs)).toThrow(
      /did not ask for/i,
    );
  });

  it("names the courts it actually got, so the log identifies the fault", () => {
    const docs = [doc({ docsource: "Gauhati High Court" })];
    expect(() => attributeDocs("karnataka", docs)).toThrow(
      /Gauhati High Court/,
    );
  });

  it("rejects a page that is only PARTLY foreign", () => {
    // One stray is still proof the filter did not apply. Keeping the
    // matching nine and dropping one would hide a broken doctype.
    const docs = [
      ...page("Bombay High Court", 9),
      doc({ tid: 99, docsource: "Kerala High Court" }),
    ];
    expect(() => attributeDocs("bombay", docs)).toThrow(/Kerala High Court/);
  });

  it("rejects a document carrying no docsource at all", () => {
    expect(() => attributeDocs("bombay", [doc({ docsource: undefined })])).toThrow(
      /no docsource/,
    );
  });

  it("accepts an empty page without throwing", () => {
    expect(attributeDocs("bombay", [])).toEqual([]);
  });

  it("matches IK's own misspelling for the Calcutta appellate side", () => {
    const docs = page("Calcutta High Court (Appellete Side)", 3);
    expect(attributeDocs("kolkata_app", docs)).toEqual(docs);
    expect(() =>
      attributeDocs("kolkata_app", page("Calcutta High Court (Appellate Side)", 3)),
    ).toThrow();
  });
});

describe("fetchJudgmentsForCourt", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  function stubIK(pages: IKDoc[][], found?: string) {
    let call = 0;
    const fetchMock = vi.fn(async () => {
      const docs = pages[call++] ?? [];
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ docs, found }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("stamps the requested court on a correctly attributed page", async () => {
    vi.stubEnv("IK_API_KEY", "test-key");
    stubIK([page("Bombay High Court", 3)]);

    const out = await fetchJudgmentsForCourt({
      courtCode: "bombay",
      fromDate: new Date("2026-09-01"),
      toDate: new Date("2026-09-03"),
    });

    expect(out.records).toHaveLength(3);
    expect(out.records[0].court_code).toBe("bombay");
    expect(out.records[0].court_name).toBe("Bombay High Court");
  });

  it("throws rather than return foreign judgments under the wrong label", async () => {
    vi.stubEnv("IK_API_KEY", "test-key");
    stubIK([[doc({ docsource: "Delhi District Court" })]]);

    await expect(
      fetchJudgmentsForCourt({
        courtCode: "karnataka",
        fromDate: new Date("2026-09-01"),
        toDate: new Date("2026-09-03"),
      }),
    ).rejects.toThrow(/Delhi District Court/);
  });
});

describe("fetchJudgmentsForAllCourts", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("isolates one unattributable court instead of failing the whole run", async () => {
    vi.stubEnv("IK_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () =>
          url.includes("karnataka")
            ? { docs: [doc({ docsource: "Gauhati High Court" })] }
            : { docs: page("Bombay High Court", 2) },
      })),
    );

    const results = await fetchJudgmentsForAllCourts({
      courts: ["bombay", "karnataka"],
      fromDate: new Date("2026-09-01"),
      toDate: new Date("2026-09-03"),
    });

    expect(results.get("bombay")?.records).toHaveLength(2);
    expect(results.get("karnataka")?.records).toEqual([]);
    // A court that threw must not read as "published nothing".
    expect(results.get("karnataka")?.error).toMatch(/Gauhati High Court/);
  });
});

describe("parseFoundTotal", () => {
  it("reads the total out of IK's human string", () => {
    expect(parseFoundTotal("1 - 10 of 732")).toBe(732);
  });

  it("handles a thousands separator", () => {
    expect(parseFoundTotal("1 - 10 of 3,153")).toBe(3153);
  });

  it("reads an empty result set as zero, not unknown", () => {
    expect(parseFoundTotal("No matching results")).toBe(0);
  });

  it("returns null rather than a confident zero on an unknown shape", () => {
    // If IK changes this string, the ingest must report "unknown", never
    // claim the court published nothing.
    expect(parseFoundTotal("about a thousand")).toBeNull();
    expect(parseFoundTotal(undefined)).toBeNull();
  });
});

describe("fetchJudgmentsForCourt coverage reporting", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  function stub(docs: IKDoc[], found: string) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ docs, found }),
      })),
    );
  }

  const window = {
    fromDate: new Date("2026-09-01"),
    toDate: new Date("2026-09-03"),
  };

  it("flags truncation when IK holds more than one page", async () => {
    vi.stubEnv("IK_API_KEY", "test-key");
    // Bombay's real numbers on 2026-09-07: 732 available, 10 taken.
    stub(page("Bombay High Court", IK_PAGE_SIZE), "1 - 10 of 732");

    const out = await fetchJudgmentsForCourt({ courtCode: "bombay", ...window });

    expect(out.found).toBe(732);
    expect(out.records).toHaveLength(IK_PAGE_SIZE);
    expect(out.truncated).toBe(true);
  });

  it("does not flag truncation when the page holds everything", async () => {
    vi.stubEnv("IK_API_KEY", "test-key");
    stub(page("Telangana High Court", 4), "1 - 4 of 4");

    const out = await fetchJudgmentsForCourt({
      courtCode: "telangana",
      ...window,
    });

    expect(out.found).toBe(4);
    expect(out.truncated).toBe(false);
  });

  it("never claims truncation when the total could not be parsed", async () => {
    vi.stubEnv("IK_API_KEY", "test-key");
    stub(page("Delhi High Court", 3), "something unexpected");

    const out = await fetchJudgmentsForCourt({ courtCode: "delhi", ...window });

    expect(out.found).toBeNull();
    expect(out.truncated).toBe(false);
  });
});
