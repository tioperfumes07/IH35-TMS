/**
 * CLOSURE-11 — Maintenance services catalog + ETA calculator unit tests.
 */
import { describe, it, expect } from "vitest";
import { calculateServiceEta } from "./eta-calculator.js";

describe("calculateServiceEta — CLOSURE-11 acceptance scenario", () => {
  it("unit at 10k mi, last oil change at 5k, 25k interval → next due at 30k", () => {
    const eta = calculateServiceEta({
      intervalMiles: 25_000,
      intervalMonths: null,
      lastCompletedOdometer: 5_000,
      lastCompletedDate: null,
      currentOdometer: 10_000,
      asOf: new Date("2026-06-08"),
    });
    expect(eta.dueAtMiles).toBe(30_000);
    expect(eta.milesUntilDue).toBe(20_000);
    expect(eta.daysUntilDue).toBeGreaterThan(0);
    expect(eta.status).toBe("ok");
  });

  it("overdue unit returns overdue status", () => {
    const eta = calculateServiceEta({
      intervalMiles: 25_000,
      intervalMonths: null,
      lastCompletedOdometer: 5_000,
      lastCompletedDate: null,
      currentOdometer: 32_000,
    });
    expect(eta.status).toBe("overdue");
  });

  it("soon-due returns soon status", () => {
    const eta = calculateServiceEta({
      intervalMiles: 25_000,
      intervalMonths: null,
      lastCompletedOdometer: 5_000,
      lastCompletedDate: null,
      currentOdometer: 26_000,
    });
    expect(eta.status).toBe("soon");
  });

  it("uses 12k mi/mo default when no Samsara data", () => {
    const eta = calculateServiceEta({
      intervalMiles: 12_000,
      intervalMonths: null,
      lastCompletedOdometer: 0,
      lastCompletedDate: null,
      currentOdometer: 0,
      asOf: new Date("2026-06-08"),
    });
    expect(eta.daysUntilDue).toBe(30);
  });
});
