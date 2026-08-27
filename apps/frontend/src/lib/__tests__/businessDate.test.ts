import { describe, expect, it } from "vitest";
import { companyNow, companyToday, companyWallClockToIso } from "../businessDate";

describe("companyNow (America/Chicago datetime-local default)", () => {
  it("returns the Central-local date, not the UTC date, after the day has rolled in UTC", () => {
    // 2026-06-30T01:00:00Z is 2026-06-29 20:00 in America/Chicago (CDT, UTC-5).
    // A naive new Date().toISOString() default would show "2026-06-30T01:00" (tomorrow) — the bug.
    const instant = new Date("2026-06-30T01:00:00Z");
    const value = companyNow(instant);
    expect(value).toBe("2026-06-29T20:00");
    expect(value.startsWith("2026-06-29T")).toBe(true);
  });

  it("emits the 'YYYY-MM-DDTHH:mm' shape expected by <input type=datetime-local>", () => {
    expect(companyNow(new Date("2026-06-30T01:00:00Z"))).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it("agrees with companyToday on the date portion at the same instant", () => {
    const instant = new Date("2026-06-30T01:00:00Z");
    expect(companyNow(instant).slice(0, 10)).toBe(companyToday(instant));
  });
});

// LEGAL-MATTER-DEADLINE-CREATE-WRONG-TZ-INSTANT — companyWallClockToIso replaces the naive
// `new Date(localValue).toISOString()` round-trip (which interprets a zoneless wall-clock string
// in the VIEWER's browser timezone) with a correct America/Chicago interpretation.
describe("companyWallClockToIso (wall clock assumed America/Chicago -> UTC instant)", () => {
  it("converts a CDT (summer, UTC-5) wall clock correctly", () => {
    expect(companyWallClockToIso("2026-07-15T09:00")).toBe("2026-07-15T14:00:00.000Z");
  });

  it("converts a CST (winter, UTC-6) wall clock correctly", () => {
    expect(companyWallClockToIso("2026-01-15T09:00")).toBe("2026-01-15T15:00:00.000Z");
  });

  it("shifts the calendar day forward for a late-evening CT deadline (the exact display bug this pairs with)", () => {
    // 11 PM CDT on Aug 31 is 04:00 UTC on Sep 1 — proves the stored instant now correctly reflects
    // the operator's intended CT day, matching what formatDateTimeUS will later display back in CT.
    expect(companyWallClockToIso("2026-08-31T23:00")).toBe("2026-09-01T04:00:00.000Z");
  });

  it("round-trips exactly through companyNow for an arbitrary instant", () => {
    const instant = new Date("2026-06-30T01:00:00Z");
    const wallClock = companyNow(instant); // "2026-06-29T20:00" (CDT)
    expect(companyWallClockToIso(wallClock)).toBe(instant.toISOString());
  });

  it("does not throw and returns a valid instant near the spring-forward gap (no exact value asserted — the local time is genuinely undefined for that hour)", () => {
    // 2026-03-08 02:00 CST -> 03:00 CDT; 02:00-02:59 does not exist that day.
    const result = companyWallClockToIso("2026-03-08T02:30");
    expect(result).not.toBe("");
    expect(Number.isNaN(new Date(result).getTime())).toBe(false);
  });

  it("does not throw and returns a valid instant near the fall-back ambiguous hour", () => {
    // 2026-11-01 01:00-01:59 CDT repeats as 01:00-01:59 CST; either interpretation is defensible.
    const result = companyWallClockToIso("2026-11-01T01:30");
    expect(result).not.toBe("");
    expect(Number.isNaN(new Date(result).getTime())).toBe(false);
  });

  it("returns '' for empty/unparseable input", () => {
    expect(companyWallClockToIso("")).toBe("");
    expect(companyWallClockToIso("not-a-date")).toBe("");
    expect(companyWallClockToIso("2026-08-31")).toBe(""); // date-only, no time — not this function's contract
  });
});
