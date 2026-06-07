import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  computeLateRate,
  isChronicOffender,
  isLateArrival,
} from "../late-arrival.service.js";

describe("late-arrival analytics (GAP-30)", () => {
  const routesPath = resolve(import.meta.dirname, "../late-arrival.routes.ts");
  const servicePath = resolve(import.meta.dirname, "../late-arrival.service.ts");
  const workerPath = resolve(import.meta.dirname, "../../../jobs/late-arrival-aggregator-worker.ts");
  const indexPath = resolve(import.meta.dirname, "../../../index.ts");

  it("computes late rate and chronic offender threshold", () => {
    expect(computeLateRate(2, 10)).toBe(0.2);
    expect(isChronicOffender(0.21)).toBe(true);
    expect(isChronicOffender(0.2)).toBe(false);
  });

  it("detects late arrival with grace minutes", () => {
    const scheduled = "2026-06-01T10:00:00.000Z";
    expect(
      isLateArrival({
        arrived_at: "2026-06-01T10:25:00.000Z",
        scheduled_at: scheduled,
        grace_minutes: 30,
      })
    ).toBe(false);
    expect(
      isLateArrival({
        arrived_at: "2026-06-01T10:31:00.000Z",
        scheduled_at: scheduled,
        grace_minutes: 30,
      })
    ).toBe(true);
    expect(
      isLateArrival({
        arrived_at: "2026-06-01T10:31:00.000Z",
        scheduled_at: null,
        grace_minutes: 30,
      })
    ).toBe(false);
  });

  it("registers analytics late-arrivals endpoints", () => {
    const src = readFileSync(routesPath, "utf8");
    expect(src).toContain("/api/v1/dispatch/analytics/late-arrivals");
    expect(src).toContain("/api/v1/dispatch/analytics/late-arrivals/driver/:uuid");
    expect(src).toContain("/api/v1/dispatch/analytics/late-arrivals/customer/:uuid");
    expect(src).toContain("registerLateArrivalAnalyticsRoutes");
  });

  it("aggregates by driver, customer, and lane in service layer", () => {
    const src = readFileSync(servicePath, "utf8");
    expect(src).toContain("aggregateLateArrivals");
    expect(src).toContain('case "driver"');
    expect(src).toContain('case "customer"');
    expect(src).toContain('case "lane"');
    expect(src).toContain("dispatch.stop_arrivals");
    expect(src).toContain("set_config('app.operating_company_id'");
  });

  it("schedules 6h aggregator worker", () => {
    const src = readFileSync(workerPath, "utf8");
    expect(src).toContain("initializeLateArrivalAggregatorWorker");
    expect(src).toContain("6 * 60 * 60 * 1000");
  });

  it("is wired in backend index bootstrap", () => {
    const src = readFileSync(indexPath, "utf8");
    expect(src).toContain("registerLateArrivalAnalyticsRoutes");
    expect(src).toContain("initializeLateArrivalAggregatorWorker");
  });
});
