import { describe, expect, it } from "vitest";
import { companyBusinessDate, companyBusinessDateCompact, companyBusinessDateStartIso } from "../company-business-date.js";

describe("company-business-date", () => {
  it("returns the Central calendar date, not UTC, at the evening boundary", () => {
    // 2026-06-30T01:00:00Z === 2026-06-29 20:00 America/Chicago (CDT, UTC-5).
    // The UTC date is the 30th; the company business date must be the 29th.
    const eveningCentral = new Date("2026-06-30T01:00:00Z");
    expect(companyBusinessDate(eveningCentral)).toBe("2026-06-29");
    expect(companyBusinessDateCompact(eveningCentral)).toBe("20260629");
  });

  it("matches UTC during the daytime when Central and UTC share a calendar date", () => {
    const noonCentral = new Date("2026-06-29T17:00:00Z"); // 12:00 PM CDT
    expect(companyBusinessDate(noonCentral)).toBe("2026-06-29");
  });

  it("rolls over at Central midnight, not UTC midnight", () => {
    // 2026-06-29T05:30:00Z === 2026-06-29 00:30 Central (already the 29th locally,
    // while UTC is still ... also the 29th here) — and one minute before Central midnight:
    const justBeforeCentralMidnight = new Date("2026-06-30T04:59:00Z"); // 2026-06-29 23:59 CDT
    expect(companyBusinessDate(justBeforeCentralMidnight)).toBe("2026-06-29");
    const justAfterCentralMidnight = new Date("2026-06-30T05:01:00Z"); // 2026-06-30 00:01 CDT
    expect(companyBusinessDate(justAfterCentralMidnight)).toBe("2026-06-30");
  });

  // 0091-g6-1 DST hardening: the UTC↔Central offset differs by season (CDT = UTC-5 summer,
  // CST = UTC-6 winter). A fixed -5h assumption would post the wrong day for half the year.
  it("uses the winter CST offset (UTC-6), not a fixed summer offset, at the evening boundary", () => {
    // 2026-01-15T05:30:00Z === 2026-01-14 23:30 America/Chicago (CST, UTC-6).
    // The UTC date is the 15th; the company business date must be the 14th. Under CDT (-5)
    // this instant would be 00:30 on the 15th — proving the offset is resolved per-season.
    const winterEvening = new Date("2026-01-15T05:30:00Z");
    expect(companyBusinessDate(winterEvening)).toBe("2026-01-14");
  });

  it("handles the spring-forward transition (CST→CDT) at the Central day boundary", () => {
    // Spring forward: 2026-03-08 02:00 CST → 03:00 CDT. Just before local midnight that day is
    // still CST (UTC-6): 2026-03-08T05:30:00Z === 2026-03-07 23:30 CST → business date 03-07.
    const beforeSpringForward = new Date("2026-03-08T05:30:00Z");
    expect(companyBusinessDate(beforeSpringForward)).toBe("2026-03-07");
    // After the jump the offset is CDT (UTC-5): 2026-03-08T18:00:00Z === 2026-03-08 13:00 CDT.
    const afterSpringForward = new Date("2026-03-08T18:00:00Z");
    expect(companyBusinessDate(afterSpringForward)).toBe("2026-03-08");
  });

  it("handles the fall-back transition (CDT→CST) at the Central day boundary", () => {
    // Fall back: 2026-11-01 02:00 CDT → 01:00 CST. Evening of 11-01 is CST (UTC-6):
    // 2026-11-02T05:30:00Z === 2026-11-01 23:30 CST → business date 11-01, not the UTC 11-02.
    const fallBackEvening = new Date("2026-11-02T05:30:00Z");
    expect(companyBusinessDate(fallBackEvening)).toBe("2026-11-01");
  });

  it("Central midnight winter (CST): posting as-of must not use UTC date slice", () => {
    // 2026-01-16T05:59:00Z = 2026-01-15 23:59 CST — UTC slice would be 01-16.
    const winterPreMidnight = new Date("2026-01-16T05:59:00Z");
    expect(winterPreMidnight.toISOString().slice(0, 10)).toBe("2026-01-16");
    expect(companyBusinessDate(winterPreMidnight)).toBe("2026-01-15");
    // 2026-01-16T06:01:00Z = 2026-01-16 00:01 CST
    expect(companyBusinessDate(new Date("2026-01-16T06:01:00Z"))).toBe("2026-01-16");
  });

  it("Central midnight summer (CDT): posting as-of must not use UTC date slice", () => {
    // 2026-07-15T04:59:00Z = 2026-07-14 23:59 CDT — UTC slice would be 07-15.
    const summerPreMidnight = new Date("2026-07-15T04:59:00Z");
    expect(summerPreMidnight.toISOString().slice(0, 10)).toBe("2026-07-15");
    expect(companyBusinessDate(summerPreMidnight)).toBe("2026-07-14");
    expect(companyBusinessDate(new Date("2026-07-15T05:01:00Z"))).toBe("2026-07-15");
  });
});

describe("companyBusinessDateStartIso", () => {
  it("maps Central midnight with the correct seasonal offset", () => {
    expect(companyBusinessDateStartIso("2026-01-12")).toBe("2026-01-12T06:00:00.000Z");
    expect(companyBusinessDateStartIso("2026-06-01")).toBe("2026-06-01T05:00:00.000Z");
  });
});
