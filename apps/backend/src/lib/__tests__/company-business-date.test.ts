import { describe, expect, it } from "vitest";
import { companyBusinessDate, companyBusinessDateCompact } from "../company-business-date.js";

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
});
