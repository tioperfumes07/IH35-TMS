import { describe, expect, it } from "vitest";
import { LISTS_MODULE_COUNT_SPECS } from "./lists-module-count-spec.js";

/**
 * Guard — the count spec's companyScoped flag must match each catalog's actual shape, or the count
 * query adds `WHERE operating_company_id = $1` against a table that lacks the column → 42703 → 500
 * (which the to_regclass table-existence guard cannot catch). Fleet catalogs are GLOBAL (fleet factory
 * has no operating_company_id; 0153 creates them with a globally-unique code) → must be companyScoped:false.
 */
describe("lists module count spec — companyScoped matches catalog shape", () => {
  it("all fleet catalogs are global (companyScoped:false)", () => {
    const fleet = LISTS_MODULE_COUNT_SPECS.fleet ?? [];
    expect(fleet.length).toBeGreaterThan(0);
    for (const spec of fleet) {
      expect(spec.companyScoped, `fleet.${spec.table} must be companyScoped:false (global catalog)`).toBe(false);
    }
  });

  it("maintenance + fuel catalogs.* tables are company-scoped (reference.* stay global)", () => {
    for (const domain of ["maintenance", "fuel"] as const) {
      const specs = LISTS_MODULE_COUNT_SPECS[domain] ?? [];
      expect(specs.length).toBeGreaterThan(0);
      for (const spec of specs) {
        const isReference = spec.schema === "reference";
        if (isReference) {
          expect(spec.companyScoped, `${domain}.${spec.table} (reference) is global`).toBe(false);
        } else {
          expect(spec.companyScoped, `${domain}.${spec.table} (catalogs) should be company-scoped`).toBe(true);
        }
      }
    }
  });
});
