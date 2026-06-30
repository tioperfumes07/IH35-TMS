import { describe, expect, it } from "vitest";
import { companyNow, companyToday } from "../businessDate";

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
