import { describe, expect, it } from "vitest";

function assertManualRange(startIso: string, endIso: string): boolean {
  const startMs = Date.parse(startIso);
  const endMs = Date.parse(endIso);
  return Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs;
}

describe("WO manual time entry range validation", () => {
  it("accepts equal timestamps", () => {
    expect(assertManualRange("2026-05-01T12:00:00.000Z", "2026-05-01T12:00:00.000Z")).toBe(true);
  });

  it("accepts ordered timestamps", () => {
    expect(assertManualRange("2026-05-01T12:00:00.000Z", "2026-05-01T13:00:00.000Z")).toBe(true);
  });

  it("rejects inverted timestamps", () => {
    expect(assertManualRange("2026-05-01T13:00:00.000Z", "2026-05-01T12:00:00.000Z")).toBe(false);
  });

  it("rejects invalid start", () => {
    expect(assertManualRange("not-a-date", "2026-05-01T12:00:00.000Z")).toBe(false);
  });

  it("rejects invalid end", () => {
    expect(assertManualRange("2026-05-01T12:00:00.000Z", "not-a-date")).toBe(false);
  });

  it("accepts offsets when ordered", () => {
    expect(assertManualRange("2026-05-01T07:00:00.000-05:00", "2026-05-01T09:00:00.000-05:00")).toBe(true);
  });

  it("handles leap-second-ish timestamps as ISO parses permit", () => {
    expect(assertManualRange("2026-01-01T00:00:00.000Z", "2026-01-01T00:00:01.000Z")).toBe(true);
  });

  it("rejects empty strings", () => {
    expect(assertManualRange("", "2026-05-01T12:00:00.000Z")).toBe(false);
    expect(assertManualRange("2026-05-01T12:00:00.000Z", "")).toBe(false);
  });

  it("accepts same-ms ordering boundary", () => {
    expect(assertManualRange("2026-05-01T12:00:00.001Z", "2026-05-01T12:00:00.002Z")).toBe(true);
  });

  it("accepts long-running shifts", () => {
    expect(assertManualRange("2026-05-01T08:00:00.000Z", "2026-05-02T08:00:00.000Z")).toBe(true);
  });
});
