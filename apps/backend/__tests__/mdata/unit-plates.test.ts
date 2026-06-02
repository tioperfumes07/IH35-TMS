import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MX_JURISDICTIONS, US_JURISDICTIONS, validatePlateJurisdiction } from "../../src/mdata/unit-plates.routes.js";

describe("unit plate jurisdiction validation", () => {
  it("accepts US state codes and MX federal/state", () => {
    assert.equal(validatePlateJurisdiction("US", "TX"), true);
    assert.equal(validatePlateJurisdiction("US", "DC"), true);
    assert.equal(validatePlateJurisdiction("MX", "Federal"), true);
    assert.equal(validatePlateJurisdiction("MX", "Nuevo León"), true);
    assert.equal(validatePlateJurisdiction("US", "XX"), false);
  });

  it("lists all 32 MX states plus Federal", () => {
    assert.ok(MX_JURISDICTIONS.includes("Federal"));
    assert.ok(MX_JURISDICTIONS.length >= 33);
    assert.ok(US_JURISDICTIONS.includes("TX"));
  });
});
