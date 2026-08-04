import { describe, expect, it } from "vitest";
import { evaluateScenarioTrackerStaleness, formatLiveAsOfCt } from "./staleness";

describe("evaluateScenarioTrackerStaleness", () => {
  const base = {
    nowMs: Date.parse("2026-08-04T20:42:40Z"),
    generatedAtUtc: "2026-08-04T20:42:11Z",
    maxAgeSeconds: 20,
    fetchFailed: false,
    sourceHealth: [{ source: "driver_finance.driver_pay_rates", ok: true }],
  };

  it("is fresh inside 2×max_age", () => {
    expect(evaluateScenarioTrackerStaleness(base)).toEqual({ stale: false });
  });

  it("goes stale when age > 2×max_age", () => {
    const r = evaluateScenarioTrackerStaleness({
      ...base,
      nowMs: Date.parse("2026-08-04T20:43:00Z"), // 49s > 40s
    });
    expect(r.stale).toBe(true);
    if (r.stale) expect(r.banner).toMatch(/STALE — data is/);
  });

  it("goes stale on fetch failure", () => {
    const r = evaluateScenarioTrackerStaleness({ ...base, fetchFailed: true });
    expect(r.stale).toBe(true);
    if (r.stale) expect(r.banner).toMatch(/unreachable/);
  });

  it("goes stale when any source_health.ok=false", () => {
    const r = evaluateScenarioTrackerStaleness({
      ...base,
      sourceHealth: [
        { source: "driver_finance.driver_pay_rates", ok: true },
        { source: "accounting.journal_entries", ok: false },
      ],
    });
    expect(r.stale).toBe(true);
    if (r.stale) expect(r.banner).toContain("accounting.journal_entries");
  });
});

describe("formatLiveAsOfCt", () => {
  it("formats America/Chicago stamp to Live as of H:MM AM/PM CT", () => {
    expect(formatLiveAsOfCt("2026-08-04 15:42:11 America/Chicago")).toBe("Live as of 3:42 PM CT");
  });
});
