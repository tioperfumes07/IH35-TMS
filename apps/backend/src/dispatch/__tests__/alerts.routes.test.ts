import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
describe("dispatch alerts routes (B21-D6)", () => {
  const routesPath = resolve(import.meta.dirname, "../alerts.routes.ts");
  const servicePath = resolve(import.meta.dirname, "../late-arrivals.service.ts");
  const indexPath = resolve(import.meta.dirname, "../../index.ts");

  it("registers late-arrivals alert endpoint", () => {
    const src = readFileSync(routesPath, "utf8");
    expect(src).toContain("/api/v1/dispatch/alerts/late-arrivals");
    expect(src).toContain("registerDispatchAlertsRoutes");
    expect(src).toContain("listLateArrivalLoads");
  });

  it("queries dispatch loads with ETA vs scheduled grace in service layer", () => {
    const src = readFileSync(servicePath, "utf8");
    expect(src).toContain("views.dispatch_load_with_driver_status");
    expect(src).toContain("latest_eta_prediction");
    expect(src).toContain("scheduled_arrival_at");
    expect(src).toContain("DISPATCH_LATE_ARRIVAL_GRACE_MINUTES");
  });

  it("is wired in backend index bootstrap", () => {
    const src = readFileSync(indexPath, "utf8");
    expect(src).toContain("registerDispatchAlertsRoutes");
  });
});
