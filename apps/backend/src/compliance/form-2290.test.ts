import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  annualTaxForCategory,
  computeForm2290Vehicles,
  grossWeightCategoryFromLbs,
  partialYearTaxFactor,
} from "./form-2290-generator.js";

const here = path.dirname(fileURLToPath(import.meta.url));

describe("form-2290-generator", () => {
  it("maps gross weight to IRS categories", () => {
    expect(grossWeightCategoryFromLbs(54_000)).toBe("W");
    expect(grossWeightCategoryFromLbs(55_000)).toBe("A");
    expect(grossWeightCategoryFromLbs(60_000)).toBe("F");
    expect(grossWeightCategoryFromLbs(80_000)).toBe("V");
  });

  it("computes full-year and partial-year tax", () => {
    const vehicles = computeForm2290Vehicles(
      [
        {
          unitId: "u1",
          unitNumber: "101",
          vin: "1HGBH41JXMN109186",
          grossWeightLbs: 80_000,
          firstUsedMonth: null,
          suspensionClaimed: false,
        },
        {
          unitId: "u2",
          unitNumber: "102",
          vin: "1HGBH41JXMN109187",
          grossWeightLbs: 60_000,
          firstUsedMonth: "2026-01-15",
          suspensionClaimed: false,
        },
      ],
      "2025-07-01"
    );
    expect(vehicles[0]?.taxDue).toBe(annualTaxForCategory("V"));
    expect(vehicles[1]?.taxDue).toBeLessThanOrEqual(annualTaxForCategory("F"));
    expect(partialYearTaxFactor("2026-04-01", "2025-07-01")).toBeLessThan(1);
    expect(partialYearTaxFactor("2026-01-01", "2025-07-01")).toBeLessThan(1);
  });

  it("wires routes from form-425c bootstrap", () => {
    const form425c = fs.readFileSync(path.join(here, "form-425c.routes.ts"), "utf8");
    expect(form425c).toContain("registerForm2290Routes");
  });
});
