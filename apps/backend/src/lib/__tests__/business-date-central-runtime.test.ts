import { afterEach, describe, expect, it, vi } from "vitest";
import { companyBusinessDate } from "../company-business-date.js";
import { companyToday, addDaysIso, monthBoundsIso, quarterBoundsIso } from "../../../../frontend/src/lib/businessDate.js";
import { formatDateUS } from "../../../../frontend/src/lib/formatDate.js";

afterEach(() => vi.useRealTimers());

describe("443.213b one business calendar for posting, picker and display", () => {
  it.each([
    ["2026-10-22T01:30:00Z", "2026-10-21", "10/21/2026"],
    ["2026-01-01T01:30:00Z", "2025-12-31", "12/31/2025"],
    ["2026-03-09T01:30:00Z", "2026-03-08", "03/08/2026"],
    ["2026-11-02T01:30:00Z", "2026-11-01", "11/01/2026"],
    ["2026-10-22T05:00:00Z", "2026-10-22", "10/22/2026"],
  ])("uses Central at %s", (instant, expected, display) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(instant));
    expect(companyBusinessDate()).toBe(expected);
    expect(companyToday()).toBe(expected);
    expect(formatDateUS(instant)).toBe(display);
    expect(formatDateUS(expected)).toBe(display);
  });

  it("keeps month/quarter defaults in the Central period at UTC month rollover", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T01:30:00Z"));
    expect(monthBoundsIso(companyToday())).toEqual({start:"2026-09-01",end:"2026-09-30"});
    expect(quarterBoundsIso(companyToday())).toEqual({start:"2026-07-01",end:"2026-09-30"});
    expect(addDaysIso(companyToday(), -30)).toBe("2026-08-31");
  });
});
