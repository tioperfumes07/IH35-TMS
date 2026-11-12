import { describe, expect, it } from "vitest";
import { fleetHealthPmRows, truckServicePmRows } from "../fleet-health-pm.js";
import type { PmDueEngineRow } from "../pm-due-engine.service.js";

const row: PmDueEngineRow = {
  pm_schedule_id: "s1", unit_id: "u1", unit_number: "unit", label: "PM",
  interval_kind: "miles", interval_miles: 25000, interval_days: null,
  last_service_odometer: 100000, current_odometer: 126000,
  current_odometer_read_at: "2026-11-12T12:00:00Z", current_odometer_source: "odometer_readings",
  current_odometer_note: null, miles_since_service: 26000, miles_to_due: -1000,
  miles_per_day: 100, projected_due_date: "2026-11-12", reason: null, baseline_absent: false,
};
describe("Fleet Health consumes canonical PM evidence", () => {
  it("uses current miles and the engine's explicit due target, not last-service as current", () => {
    expect(fleetHealthPmRows([row], "2026-11-12")[0]).toMatchObject({
      state: "overdue", odometer_mi: 126000, miles_left: -1000, next_due_odometer: 125000,
    });
  });
  it("does not call absent current mileage or unavailable rate OK", () => {
    expect(fleetHealthPmRows([{ ...row, current_odometer: null, miles_to_due: null,
      projected_due_date: null, reason: "ABSENT" }])[0]).toMatchObject({ state: "unknown", odometer_mi: null, pm_status_reason: "ABSENT" });
    expect(fleetHealthPmRows([{ ...row, miles_to_due: 6000, projected_due_date: null,
      reason: "insufficient history" }])[0]).toMatchObject({ state: "unknown", days_left: null });
  });
  it("uses the unit-specific projected date, never the fleet's 400 mi/day guess", () => {
    expect(fleetHealthPmRows([{ ...row, miles_to_due: 4000, projected_due_date: "2026-12-22" }], "2026-11-12")[0])
      .toMatchObject({ state: "ok", days_left: 40 });
    expect(fleetHealthPmRows([{ ...row, miles_to_due: 4000, projected_due_date: "2026-11-26" }], "2026-11-12")[0].state).toBe("soon");
  });
  it("selects one deterministic worst schedule for both rows and KPI, regardless of input order", () => {
    const later = { ...row, pm_schedule_id: "s2", miles_to_due: 10000, projected_due_date: "2027-01-01" };
    expect(fleetHealthPmRows([later, row], "2026-11-12")).toEqual(fleetHealthPmRows([row, later], "2026-11-12"));
    expect(fleetHealthPmRows([later, row], "2026-11-12")).toHaveLength(1);
    expect(fleetHealthPmRows([later, row], "2026-11-12")[0].pm_schedule_id).toBe("s1");
  });
  it("retains a measured odometer even without a miles schedule", () => {
    const odometers = new Map([["no-schedule", { odometer: 72000, source: "odometer_readings" as const, read_at: "2026-11-12", captured_at: "2026-11-12" }]]);
    expect(fleetHealthPmRows([], "2026-11-12", odometers)[0]).toMatchObject({
      odometer_mi: 72000, state: "none", pm_schedule_id: null, pm_baseline_absent: false,
    });
  });
  it("distinguishes missing baseline from missing current reading", () => {
    expect(fleetHealthPmRows([{ ...row, baseline_absent: true, miles_to_due: null, current_odometer: null,
      projected_due_date: null }])[0]).toMatchObject({ state: "none", pm_baseline_absent: true });
  });
});

describe("truck map retains canonical schedule evidence", () => {
  it("keeps more than four schedules and duplicate labels without alert dependence", () => {
    const rows = Array.from({ length: 6 }, (_, n) => ({ ...row, pm_schedule_id: `s${n}`, label: "Oil PM" }));
    const result = truckServicePmRows(rows, "2026-11-12");
    expect(Object.keys(result)).toHaveLength(6);
    expect(new Set(Object.values(result).map(r => r.pm_schedule_id)).size).toBe(6);
    expect(result.oil_pm).toMatchObject({ label: "Oil PM", current_odometer: 126000,
      miles_remaining: -1000, state: "overdue" });
    expect(result).toEqual(truckServicePmRows([...rows].reverse(), "2026-11-12"));
  });
  it("unknown current/rate and unsupported day/hour clocks never become healthy", () => {
    for (const interval_kind of ["days", "hours"]) {
      expect(truckServicePmRows([{ ...row, interval_kind }]).pm).toMatchObject({ state: "unknown" });
    }
    expect(truckServicePmRows([{ ...row, current_odometer: null, miles_to_due: null,
      projected_due_date: null, reason: "No current reading" }]).pm).toMatchObject({
      state: "unknown", current_odometer: null, reason: "No current reading",
    });
    expect(truckServicePmRows([{ ...row, miles_to_due: 4000, projected_due_date: null,
      reason: "No mileage rate" }]).pm.state).toBe("unknown");
  });
  it("keeps urgent clocks first for bounded existing UI consumers", () => {
    const healthy = Array.from({ length: 6 }, (_, n) => ({ ...row, label: `Healthy ${n}`,
      pm_schedule_id: `a${n}`, miles_to_due: 10000, projected_due_date: "2027-01-01" }));
    const result = truckServicePmRows([...healthy, { ...row, pm_schedule_id: "z-overdue" }], "2026-11-12");
    expect(Object.values(result)).toHaveLength(7);
    expect(Object.values(result)[0].pm_schedule_id).toBe("z-overdue");
  });
  it("does not lose special object-property labels during JSON serialization", () => {
    const result = truckServicePmRows([{ ...row, label: "__proto__" }, { ...row, pm_schedule_id: "s2", label: "constructor" }]);
    expect(Object.keys(JSON.parse(JSON.stringify(result)))).toEqual(["__proto__", "constructor"]);
  });
  it("does not promote numeric labels above overdue schedules in JSON enumeration", () => {
    const healthy = Array.from({ length: 6 }, (_, n) => ({ ...row, label: String(n + 1),
      pm_schedule_id: `a${n}`, miles_to_due: 10000, projected_due_date: "2027-01-01" }));
    const result = JSON.parse(JSON.stringify(truckServicePmRows([...healthy,
      { ...row, label: "Oil", pm_schedule_id: "z-overdue" }], "2026-11-12")));
    expect(Object.values(result)[0]).toMatchObject({ pm_schedule_id: "z-overdue" });
    expect(Object.values(result)).toHaveLength(7);
  });
});
