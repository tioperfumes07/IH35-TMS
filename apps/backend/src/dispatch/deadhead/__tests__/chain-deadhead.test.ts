import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// GO-23 owner ruling 2026-09-02: deadhead is a TRIP property, not a lane property. This suite
// proves the wiring (route registered, service never reads lane_mileage.empty_miles, cross-entity
// by construction) via source assertions -- the live compute itself is Chrome-proven against real
// prod load history (unit-scoped bypass_rls read), not mocked here.
describe("chain-deadhead.service (GO-23 deadhead producer)", () => {
  const routesPath = resolve(import.meta.dirname, "../../loads.routes.ts");
  const servicePath = resolve(import.meta.dirname, "../chain-deadhead.service.ts");
  const routesSrc = readFileSync(routesPath, "utf8");
  const serviceSrc = readFileSync(servicePath, "utf8");

  it("registers the deadhead-from-chain route", () => {
    expect(routesSrc).toContain("/api/v1/dispatch/deadhead-from-chain");
    expect(routesSrc).toContain("computeChainDeadheadMiles");
  });

  it("no longer fills miles_deadhead from catalogs.lane_mileage.empty_miles anywhere in loads.routes.ts", () => {
    // The old bug: form.setValue("miles_deadhead", lane.empty_miles, ...). Grep-proof it stays dead.
    expect(routesSrc).not.toMatch(/miles_deadhead["'`]?,\s*lane\.empty_miles/);
  });

  it("never reads any load's own stored miles_deadhead as an input (front/back attribution trap)", () => {
    expect(serviceSrc).not.toMatch(/\.miles_deadhead\b/);
    expect(serviceSrc).not.toMatch(/SELECT[^;]*miles_deadhead/i);
  });

  it("searches load_stops delivery locations with no operating_company_id filter (cross-entity by design)", () => {
    expect(serviceSrc).toContain("stop_type = 'delivery'");
    expect(serviceSrc).not.toMatch(/operating_company_id\s*=\s*\$/);
  });

  it("returns blank (never 0) when there is no locatable prior delivery", () => {
    expect(serviceSrc).toContain('"no_prior_delivery_for_unit"');
    expect(serviceSrc).toContain('"prior_delivery_not_locatable"');
    expect(serviceSrc).toContain("deadhead_miles: null");
  });

  it("uses the shared haversineMiles engine, not a new distance formula", () => {
    expect(serviceSrc).toContain('from "./optimizer.service.js"');
    expect(serviceSrc).toContain("haversineMiles(");
  });
});
