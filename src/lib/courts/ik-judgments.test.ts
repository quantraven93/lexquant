import { describe, it, expect, vi, afterEach } from "vitest";

import {
  IK_COURTS,
  IK_DOCSOURCE,
  attributeDocs,
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

  function stubIK(pages: IKDoc[][]) {
    let call = 0;
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ docs: pages[call++] ?? [] }),
    }));
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

    expect(out).toHaveLength(3);
    expect(out[0].court_code).toBe("bombay");
    expect(out[0].court_name).toBe("Bombay High Court");
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

    expect(results.get("bombay")).toHaveLength(2);
    expect(results.get("karnataka")).toEqual([]);
  });
});
