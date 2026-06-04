import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const routesSrc = readFileSync(resolve(root, "pwa-live.routes.ts"), "utf8");
const driverIndex = readFileSync(resolve(root, "index.ts"), "utf8");

describe("driver PWA live data routes (A24-11)", () => {
  it("exposes hos-clocks endpoint", () => {
    expect(routesSrc).toContain("/api/v1/driver-pwa/hos-clocks");
    expect(routesSrc).toContain("getCurrentClocks");
  });

  it("exposes recent fuel transactions endpoint", () => {
    expect(routesSrc).toContain("/api/v1/driver-pwa/recent-fuel-transactions");
    expect(routesSrc).toContain("fuel.fuel_transactions");
  });

  it("exposes equipment assignment endpoint", () => {
    expect(routesSrc).toContain("/api/v1/driver-pwa/equipment");
    expect(routesSrc).toContain("vehicle_driver_assignments");
    expect(routesSrc).toContain("mdata.equipment");
  });

  it("registers routes in driver index", () => {
    expect(driverIndex).toContain("registerDriverPwaLiveRoutes");
  });
});
