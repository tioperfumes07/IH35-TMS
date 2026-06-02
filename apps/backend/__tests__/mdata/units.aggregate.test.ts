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

  it("unit status schema includes Damaged and Transferred", () => {
    assert.ok(unitStatusSchema.options.includes("Damaged"));
    assert.ok(unitStatusSchema.options.includes("Transferred"));
  });

  it("audit field keys cover profile status context", () => {
    assert.ok(UNIT_PROFILE_AUDIT_FIELD_KEYS.includes("status_change_reason"));
    assert.ok(UNIT_PROFILE_AUDIT_FIELD_KEYS.includes("quick_availability"));
  });
});
