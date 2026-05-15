import { describe, it, expect } from "vitest";
import { computeNextRecurringRunUtc } from "./recurring.worker.js";

describe("recurring.worker cadence", () => {
  const base = "2026-05-12T15:00:00.000Z";

  it("advances weekly by 7 days", () => {
    const next = computeNextRecurringRunUtc(base, "weekly", null);
    expect(next.startsWith("2026-05-19")).toBe(true);
  });

  it("advances monthly with Luxon calendar math", () => {
    const next = computeNextRecurringRunUtc("2026-01-31T12:00:00.000Z", "monthly", null);
    expect(next.startsWith("2026-02-28") || next.startsWith("2026-02-29")).toBe(true);
  });

  it("parses custom_cron next fire", () => {
    const next = computeNextRecurringRunUtc(base, "custom_cron", "0 9 * * *");
    expect(next.length).toBeGreaterThan(10);
  });
});
