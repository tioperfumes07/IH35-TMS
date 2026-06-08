import { describe, expect, it } from "vitest";
import { DETECTOR_REGISTRY, getDetector } from "../detector.service.js";

describe("anomaly detectors", () => {
  it("registers all 6 default detectors", () => {
    expect(Object.keys(DETECTOR_REGISTRY)).toHaveLength(6);
    for (const name of ["duplicate_load_number","fuel_off_route_geo","dvir_major_open_unit","inactive_driver_assignment","geofence_duplicate_fire","pm_due_advisory"]) {
      expect(getDetector(name)).toBeTypeOf("function");
    }
  });

  it("duplicate_load_number returns findings from query", async () => {
    const client = { query: async () => ({ rows: [{ load_number: "L-1", cnt: "2", load_ids: ["a","b"] }] }) };
    const findings = await getDetector("duplicate_load_number")!(client, "oci", {});
    expect(findings).toHaveLength(1);
    expect(findings[0].evidence.load_number).toBe("L-1");
  });
});
