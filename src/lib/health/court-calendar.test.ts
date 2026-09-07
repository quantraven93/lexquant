import { describe, it, expect } from "vitest";

import {
  courtWorkingDaysBetween,
  freshWithinWorkingDays,
} from "./court-calendar";

/** An IST wall-clock instant, expressed as the UTC epoch ms. */
function ist(dateTime: string): number {
  return new Date(`${dateTime}+05:30`).getTime();
}

describe("courtWorkingDaysBetween", () => {
  it("is zero within the same IST day", () => {
    expect(
      courtWorkingDaysBetween(ist("2026-09-07T06:30"), ist("2026-09-07T23:00")),
    ).toBe(0);
  });

  it("counts a weekend as nothing", () => {
    // Fri 04 Sep -> Sun 06 Sep: Sat and Sun are not working days.
    expect(
      courtWorkingDaysBetween(ist("2026-09-04T06:30"), ist("2026-09-06T20:00")),
    ).toBe(0);
  });

  it("counts one for Sunday -> Monday", () => {
    expect(
      courtWorkingDaysBetween(ist("2026-09-06T06:30"), ist("2026-09-07T19:30")),
    ).toBe(1);
  });

  it("counts the working days across a real outage", () => {
    // Wed 02 Sep -> Mon 07 Sep: Thu, Fri, Mon.
    expect(
      courtWorkingDaysBetween(ist("2026-09-02T06:30"), ist("2026-09-07T19:30")),
    ).toBe(3);
  });

  it("never goes negative when the timestamp is in the future", () => {
    expect(
      courtWorkingDaysBetween(ist("2026-09-10T06:30"), ist("2026-09-07T19:30")),
    ).toBe(0);
  });
});

describe("freshWithinWorkingDays — the ik dot", () => {
  const MAX = 1;

  it("is GREEN on Monday when the last ingest was Sunday's run", () => {
    // The false red this fix exists for. Courts publish nothing Sat/Sun, so
    // Monday's 01:00 UTC run legitimately finds nothing new and the last
    // ingest stays at Sunday. The old fixed 36h window red-dotted here
    // every single Monday.
    expect(
      freshWithinWorkingDays(
        "2026-09-06T01:03:32Z",
        MAX,
        ist("2026-09-07T19:30"),
      ),
    ).toBe(true);
  });

  it("is RED on Monday when the last ingest was the previous Wednesday", () => {
    // A genuine outage must still fail loudly — the whole point of the
    // endpoint. Thu and Fri both produced nothing.
    expect(
      freshWithinWorkingDays(
        "2026-09-02T01:03:32Z",
        MAX,
        ist("2026-09-07T19:30"),
      ),
    ).toBe(false);
  });

  it("is GREEN on Friday when the last ingest was Thursday", () => {
    expect(
      freshWithinWorkingDays(
        "2026-09-03T01:03:32Z",
        MAX,
        ist("2026-09-04T19:30"),
      ),
    ).toBe(true);
  });

  it("is GREEN on Tuesday after a Monday ingest", () => {
    expect(
      freshWithinWorkingDays(
        "2026-09-07T01:03:32Z",
        MAX,
        ist("2026-09-08T19:30"),
      ),
    ).toBe(true);
  });

  it("is RED when the source has never produced anything", () => {
    expect(freshWithinWorkingDays(null, MAX, ist("2026-09-07T19:30"))).toBe(
      false,
    );
  });

  it("is RED on an unparseable timestamp rather than passing it through", () => {
    expect(
      freshWithinWorkingDays("not a date", MAX, ist("2026-09-07T19:30")),
    ).toBe(false);
  });
});

describe("freshWithinWorkingDays — the sci dot tolerates two quiet days", () => {
  const MAX = 2;

  it("is GREEN on Monday when the last SC ingest was Thursday", () => {
    // Fri + Mon = 2 working days; the SC's daily volume is small enough
    // that one quiet day is not evidence of a fault.
    expect(
      freshWithinWorkingDays(
        "2026-09-03T01:03:33Z",
        MAX,
        ist("2026-09-07T19:30"),
      ),
    ).toBe(true);
  });

  it("is RED on Monday when the last SC ingest was the previous Wednesday", () => {
    expect(
      freshWithinWorkingDays(
        "2026-09-02T01:03:33Z",
        MAX,
        ist("2026-09-07T19:30"),
      ),
    ).toBe(false);
  });
});
