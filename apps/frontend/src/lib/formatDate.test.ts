import { describe, expect, it } from "vitest";
import {
  formatDateUS,
  formatDateTimeUS,
  formatDateQboList,
  parseDateUS,
  maskTypedDateUS,
  DATE_PLACEHOLDER_US,
} from "./formatDate";

describe("formatDateUS", () => {
  it("formats a bare ISO date as MM/DD/YYYY with no timezone shift", () => {
    // The stored day (03) must survive regardless of the runner's timezone — no new Date('YYYY-MM-DD').
    expect(formatDateUS("2026-07-03")).toBe("07/03/2026");
    expect(formatDateUS("2026-01-01")).toBe("01/01/2026");
    expect(formatDateUS("2026-12-31")).toBe("12/31/2026");
  });

  it("formats the date portion of a full ISO timestamp", () => {
    expect(formatDateUS("2026-07-03T18:30:00Z")).toBe("07/03/2026");
    expect(formatDateUS("2026-07-03T00:00:00")).toBe("07/03/2026");
  });

  it("formats a Date object as its local calendar date", () => {
    expect(formatDateUS(new Date(2026, 6, 3))).toBe("07/03/2026");
  });

  it("returns empty string for null / undefined / empty / unparseable", () => {
    expect(formatDateUS(null)).toBe("");
    expect(formatDateUS(undefined)).toBe("");
    expect(formatDateUS("")).toBe("");
    expect(formatDateUS("not-a-date")).toBe("");
  });

  it("never emits the ISO YYYY-MM-DD shape", () => {
    const out = formatDateUS("2026-07-03");
    expect(out).not.toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("formatDateQboList (D47)", () => {
  it("formats as M/D/YY without leading zeros", () => {
    expect(formatDateQboList("2026-09-14")).toBe("9/14/26");
    expect(formatDateQboList("2026-07-31")).toBe("7/31/26");
    expect(formatDateQboList("2026-01-05")).toBe("1/5/26");
  });

  it("returns empty for blank input", () => {
    expect(formatDateQboList(null)).toBe("");
    expect(formatDateQboList("")).toBe("");
  });
});

describe("formatDateTimeUS", () => {
  it("returns empty string for empty input", () => {
    expect(formatDateTimeUS("")).toBe("");
    expect(formatDateTimeUS(null)).toBe("");
  });

  it("produces a US-style date portion", () => {
    expect(formatDateTimeUS("2026-07-03T12:00:00Z")).toMatch(/^\d{2}\/\d{2}\/\d{4}/);
  });
});

describe("DATE_PLACEHOLDER_US", () => {
  it("is the US mask, not the ISO mask", () => {
    expect(DATE_PLACEHOLDER_US).toBe("MM/DD/YYYY");
  });
});

describe("maskTypedDateUS", () => {
  it("auto-inserts slashes as digits are typed (08052026 → 08/05/2026)", () => {
    expect(maskTypedDateUS("08")).toBe("08");
    expect(maskTypedDateUS("0805")).toBe("08/05");
    expect(maskTypedDateUS("08052026")).toBe("08/05/2026");
    expect(maskTypedDateUS("8")).toBe("8");
  });

  it("strips non-digits and caps at 8 digits", () => {
    expect(maskTypedDateUS("08/05/2026")).toBe("08/05/2026");
    expect(maskTypedDateUS("08a05b2026c99")).toBe("08/05/2026");
    expect(maskTypedDateUS("")).toBe("");
  });
});

describe("parseDateUS", () => {
  it("parses MM/DD/YYYY to ISO date without timezone shift", () => {
    expect(parseDateUS("07/25/2026")).toBe("2026-07-25");
    expect(parseDateUS("1/5/2026")).toBe("2026-01-05");
  });

  it("parses digits-only MMDDYYYY / MMDDYY without requiring slash keys", () => {
    expect(parseDateUS("08052026")).toBe("2026-08-05");
    expect(parseDateUS("080526")).toBe("2026-08-05");
  });

  it("rejects invalid calendar dates", () => {
    expect(parseDateUS("02/30/2026")).toBeNull();
    expect(parseDateUS("not-a-date")).toBeNull();
  });
});
