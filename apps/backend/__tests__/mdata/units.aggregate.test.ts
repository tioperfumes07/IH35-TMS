import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseSamsaraVehiclePayload } from "../../src/mdata/unit-aggregate.service.js";
import { UNIT_PROFILE_AUDIT_FIELD_KEYS, unitStatusSchema } from "../../src/mdata/units.routes.js";

describe("unit aggregate helpers", () => {
  it("parses samsara payload odometer and faults", () => {
    const parsed = parseSamsaraVehiclePayload({
      vehicle: { odometer_mi: 120500, engine_hours: 4400, fuel_level_pct: 62, dtc_codes: [{ code: "P0420", severity: "high", description: "Catalyst" }] },
    });
    assert.equal(parsed.odometer_miles, 120500);
    assert.equal(parsed.engine_hours, 4400);
    assert.equal(parsed.fault_codes[0]?.code, "P0420");
  });

  it("parses nested Samsara stats meters and fuel percent", () => {
    const parsed = parseSamsaraVehiclePayload({
      obdOdometerMeters: { value: 160934, time: "2026-08-26T00:00:00Z" },
      obdEngineSeconds: { value: 36000 },
      fuelPercents: { value: 41 },
    });
    assert.equal(parsed.odometer_miles, 100);
    assert.equal(parsed.engine_hours, 10);
    assert.equal(parsed.fuel_level_pct, 41);
  });

  it("unit status schema includes Damaged and Transferred", () => {
    assert.ok(unitStatusSchema.options.includes("Damaged"));
    assert.ok(unitStatusSchema.options.includes("Transferred"));
  });

  it("audit field keys cover profile status context", () => {
    assert.ok(UNIT_PROFILE_AUDIT_FIELD_KEYS.includes("status_change_reason"));
    assert.ok(UNIT_PROFILE_AUDIT_FIELD_KEYS.includes("quick_availability"));
  });
});
