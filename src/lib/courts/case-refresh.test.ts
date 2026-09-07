import { describe, it, expect, vi } from "vitest";

import {
  detectCaseChanges,
  hasValue,
  newColumnSupport,
  updateCaseRow,
  type TrackedCaseFields,
} from "./case-refresh";
import { parseEcourtsCaseHtml } from "./ecourts-scraper";
import { parseResultsHtml } from "./sc-scraper";
import type { CaseStatus } from "./types";

function tracked(over: Partial<TrackedCaseFields> = {}): TrackedCaseFields {
  return {
    current_status: "Contested--DISMISSED AS INFRUCTUOUS",
    next_hearing_date: "2026-09-10",
    last_order_date: "2026-04-09",
    judges: "Y. LAKSHMANA RAO",
    ...over,
  };
}

function fresh(over: Partial<CaseStatus> = {}): CaseStatus {
  return {
    caseTitle: "A vs B",
    currentStatus: "",
    petitioner: "A",
    respondent: "B",
    hearingHistory: [],
    orders: [],
    rawData: {},
    ...over,
  };
}

describe("detectCaseChanges", () => {
  it("does NOT raise a status_change when the status was not parsed", () => {
    // The regression this whole fix exists for: the scraper used to default
    // an unparsed status to "Pending", which flapped DISPOSED -> Pending and
    // fired a user alert. An empty status must now be silent.
    const changes = detectCaseChanges(tracked(), fresh({ currentStatus: "" }));
    expect(changes.find((c) => c.type === "status_change")).toBeUndefined();
  });

  it("does NOT raise a status_change for a whitespace-only status", () => {
    const changes = detectCaseChanges(
      tracked(),
      fresh({ currentStatus: "   \n " }),
    );
    expect(changes).toEqual([]);
  });

  it("raises a status_change on a real, different status", () => {
    const changes = detectCaseChanges(
      tracked(),
      fresh({ currentStatus: "DISPOSED" }),
    );
    expect(changes).toEqual([
      {
        field: "current_status",
        type: "status_change",
        oldValue: "Contested--DISMISSED AS INFRUCTUOUS",
        newValue: "DISPOSED",
      },
    ]);
  });

  it("stays silent when the status is unchanged", () => {
    const changes = detectCaseChanges(
      tracked(),
      fresh({ currentStatus: "Contested--DISMISSED AS INFRUCTUOUS" }),
    );
    expect(changes).toEqual([]);
  });

  it("treats the 'Unknown' seed as a first read, not a change", () => {
    const changes = detectCaseChanges(
      tracked({ current_status: "Unknown" }),
      fresh({ currentStatus: "Pending" }),
    );
    expect(changes).toEqual([]);
  });

  it("raises hearing_date_change even from a null prior date (a date got fixed)", () => {
    const changes = detectCaseChanges(
      tracked({ next_hearing_date: null }),
      fresh({ nextHearingDate: "2026-09-22" }),
    );
    expect(changes).toEqual([
      {
        field: "next_hearing_date",
        type: "hearing_date_change",
        oldValue: null,
        newValue: "2026-09-22",
      },
    ]);
  });

  it("does not raise hearing_date_change on an unparsed date", () => {
    const changes = detectCaseChanges(
      tracked(),
      fresh({ nextHearingDate: "" }),
    );
    expect(changes).toEqual([]);
  });

  it("appends the order summary to a new_order when there is one", () => {
    const changes = detectCaseChanges(
      tracked(),
      fresh({ lastOrderDate: "2026-08-20", lastOrderSummary: "Adjourned" }),
    );
    expect(changes).toEqual([
      {
        field: "last_order_date",
        type: "new_order",
        oldValue: "2026-04-09",
        newValue: "2026-08-20 - Adjourned",
      },
    ]);
  });

  it("raises judge_change on a real bench change", () => {
    const changes = detectCaseChanges(
      tracked(),
      fresh({ judges: "K. SURESH REDDY" }),
    );
    expect(changes).toEqual([
      {
        field: "judges",
        type: "judge_change",
        oldValue: "Y. LAKSHMANA RAO",
        newValue: "K. SURESH REDDY",
      },
    ]);
  });

  it("does not raise judge_change on the eCourts internal court-code prefix", () => {
    // The cron reads Coram as "3521Y. LAKSHMANA RAO"; the manual-refresh
    // button strips the code before storing it. Same bench, no alert.
    const changes = detectCaseChanges(
      tracked({ judges: "Y. LAKSHMANA RAO" }),
      fresh({ judges: "3521Y. LAKSHMANA RAO" }),
    );
    expect(changes).toEqual([]);
  });

  it("does not raise judge_change on punctuation or case differences alone", () => {
    const changes = detectCaseChanges(
      tracked({ judges: "Y. LAKSHMANA RAO" }),
      fresh({ judges: "y lakshmana  rao" }),
    );
    expect(changes).toEqual([]);
  });

  it("does not raise judge_change when nothing was ever stored", () => {
    const changes = detectCaseChanges(
      tracked({ judges: "" }),
      fresh({ judges: "K. SURESH REDDY" }),
    );
    expect(changes).toEqual([]);
  });
});

describe("hasValue", () => {
  it("rejects null, undefined, empty and whitespace", () => {
    expect(hasValue(null)).toBe(false);
    expect(hasValue(undefined)).toBe(false);
    expect(hasValue("")).toBe(false);
    expect(hasValue("  ")).toBe(false);
    expect(hasValue("DISPOSED")).toBe(true);
  });
});

describe("parseEcourtsCaseHtml", () => {
  it("does not fabricate a status when the page carries none", () => {
    const html =
      "<table><tr><td>Petitioner</td><td>: NAKSHATRA REDDY</td></tr>" +
      "<tr><td>Respondent</td><td>: STATE OF AP</td></tr></table>";
    const parsed = parseEcourtsCaseHtml(html);
    expect(parsed).not.toBeNull();
    expect(parsed!.currentStatus).toBe("");
    expect(parsed!.currentStatus).not.toBe("Pending");
  });

  it("returns the status the page actually publishes", () => {
    const html =
      "<table><tr><td>Case Status</td><td>: DISPOSED</td></tr></table>";
    expect(parseEcourtsCaseHtml(html)?.currentStatus).toBe("DISPOSED");
  });

  it("returns null when nothing at all could be read", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(
      parseEcourtsCaseHtml("<div>service temporarily down</div>"),
    ).toBeNull();
    warn.mockRestore();
  });

  it("strips the eCourts internal court code off Coram", () => {
    const html =
      "<table><tr><td>Coram</td><td>: 3521Y. LAKSHMANA RAO</td></tr></table>";
    expect(parseEcourtsCaseHtml(html)?.judges).toBe("Y. LAKSHMANA RAO");
  });

  it("does not fabricate an 'Unknown' case title", () => {
    const html =
      "<table><tr><td>Case Status</td><td>: DISPOSED</td></tr></table>";
    expect(parseEcourtsCaseHtml(html)?.caseTitle).toBe("");
  });

  it("an unparsed page cannot produce a status_change end to end", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const parsed = parseEcourtsCaseHtml(
      "<html><body>Site under maintenance</body></html>",
    );
    warn.mockRestore();
    // Nothing to compare against, so nothing to alert on.
    expect(parsed).toBeNull();
    const changes = parsed ? detectCaseChanges(tracked(), parsed) : [];
    expect(changes).toEqual([]);
  });
});

describe("parseResultsHtml (Supreme Court)", () => {
  // The SC path carried the identical "Pending" fabrication as eCourts and is
  // the sole status source for SC cases in both pipelines, so it needs the
  // same guarantees rather than the same shape of bug.
  it("does not fabricate a status when the page carries none", () => {
    const html =
      "<table><tr><td>1</td><td>133/2026</td><td>SLP(Crl) 2090/2026</td>" +
      "<td>NAKSHATRA REDDY</td><td>STATE OF AP</td></tr></table>";
    const parsed = parseResultsHtml(html);
    expect(parsed).not.toBeNull();
    expect(parsed!.currentStatus).toBe("");
    expect(parsed!.currentStatus).not.toBe("Pending");
  });

  it("returns the status the Court actually publishes", () => {
    const html =
      "<table><tr><td>1</td><td>133/2026</td><td>SLP(Crl) 2090/2026</td>" +
      "<td>A</td><td>B</td><td>DISPOSED</td></tr></table>";
    expect(parseResultsHtml(html)?.currentStatus).toBe("DISPOSED");
  });

  it("returns null when nothing at all could be read", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(parseResultsHtml("<div>service temporarily down</div>")).toBeNull();
    warn.mockRestore();
  });

  it("does not fabricate an 'Unknown' case title", () => {
    const html =
      "<table><tr><td>Case Status</td><td>: DISPOSED</td></tr></table>";
    expect(parseResultsHtml(html)?.caseTitle).toBe("");
  });

  it("an unparsed page cannot produce a status_change end to end", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const parsed = parseResultsHtml(
      "<html><body>Site under maintenance</body></html>",
    );
    warn.mockRestore();
    expect(parsed).toBeNull();
    const changes = parsed ? detectCaseChanges(tracked(), parsed) : [];
    expect(changes).toEqual([]);
  });
});

interface UpdateCall {
  payload: Record<string, unknown>;
}

function makeSupabase(
  behaviour: (
    payload: Record<string, unknown>,
  ) => { message?: string; code?: string } | null,
  calls: UpdateCall[],
) {
  return {
    from() {
      return {
        update(payload: Record<string, unknown>) {
          calls.push({ payload });
          return {
            eq: () => Promise.resolve({ error: behaviour(payload) }),
          };
        },
      };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("updateCaseRow", () => {
  it("writes last_fetch_ok when the column exists", async () => {
    const calls: UpdateCall[] = [];
    const sb = makeSupabase(() => null, calls);
    const support = newColumnSupport();

    const ok = await updateCaseRow(
      sb,
      "case-1",
      { last_checked_at: "t", last_fetch_ok: "t" },
      support,
    );

    expect(ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].payload.last_fetch_ok).toBe("t");
    expect(support.lastFetchOk).toBe(true);
  });

  it("retries without last_fetch_ok when migration 012 is unapplied", async () => {
    const calls: UpdateCall[] = [];
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const sb = makeSupabase(
      (payload) =>
        "last_fetch_ok" in payload
          ? {
              code: "PGRST204",
              message: "Could not find the 'last_fetch_ok' column",
            }
          : null,
      calls,
    );
    const support = newColumnSupport();

    const ok = await updateCaseRow(
      sb,
      "case-1",
      { last_checked_at: "t", last_fetch_ok: "t", current_status: "DISPOSED" },
      support,
    );

    expect(ok).toBe(true);
    expect(calls).toHaveLength(2);
    // The retry keeps every real field and drops only the missing column.
    expect(calls[1].payload).toEqual({
      last_checked_at: "t",
      current_status: "DISPOSED",
    });
    expect(support.lastFetchOk).toBe(false);
    warn.mockRestore();
  });

  it("skips the doomed attempt once the column is known to be absent", async () => {
    const calls: UpdateCall[] = [];
    const sb = makeSupabase(() => null, calls);
    const support = { lastFetchOk: false };

    await updateCaseRow(
      sb,
      "case-1",
      { last_fetch_ok: "t", judges: "X" },
      support,
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].payload).toEqual({ judges: "X" });
  });

  it("reports a genuine write failure rather than retrying blindly", async () => {
    const calls: UpdateCall[] = [];
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const sb = makeSupabase(
      () => ({ code: "23505", message: "duplicate key value" }),
      calls,
    );

    const ok = await updateCaseRow(
      sb,
      "case-1",
      { last_checked_at: "t", last_fetch_ok: "t" },
      newColumnSupport(),
    );

    expect(ok).toBe(false);
    expect(calls).toHaveLength(1);
    err.mockRestore();
  });
});
