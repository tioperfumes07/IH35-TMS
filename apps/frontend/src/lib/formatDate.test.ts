import { describe, expect, it } from "vitest";
import { formatDateUS, formatDateTimeUS, DATE_PLACEHOLDER_US } from "./formatDate";

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
