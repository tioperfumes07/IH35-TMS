import { describe, expect, it } from "vitest";
import { LISTS_MODULE_COUNT_SPECS } from "./lists-module-count-spec.js";

/**
 * Guard — the count spec's companyScoped flag must match each catalog's actual shape, or the count
 * query adds `WHERE operating_company_id = $1` against a table that lacks the column → 42703 → 500
 * (which the to_regclass table-existence guard cannot catch).
 *
 * Fleet catalogs are PER-ENTITY as of migration 202607860000 (owner ruling 2026-07-24) — EXCEPT
 * equipment_types (dual write-surface, converted in a follow-up PR) and tire_positions (never
 * converted), which stay global. So the flag is now per-table, not "all false".
 */
describe("lists module count spec — companyScoped matches catalog shape", () => {
  // The 8 fleet/asset catalogs converted to per-entity by 202607860000 (carry operating_company_id).
  const FLEET_PER_ENTITY = new Set([
    "tractor_statuses",
    "trailer_statuses",
    "asset_condition_codes",
    "unit_ownership_types",
    "trailer_types",
    "lease_terms",
    "asset_statuses",
    "asset_locations",
  ]);
  // Still global (no operating_company_id column) — companyScoped MUST stay false or the count 42703s.
  const FLEET_STILL_GLOBAL = new Set(["equipment_types", "tire_positions"]);

  it("fleet catalog companyScoped flags match each table's actual per-entity shape", () => {
    const fleet = LISTS_MODULE_COUNT_SPECS.fleet ?? [];
    expect(fleet.length).toBeGreaterThan(0);
    for (const spec of fleet) {
      if (FLEET_PER_ENTITY.has(spec.table)) {
        expect(spec.companyScoped, `fleet.${spec.table} was converted to per-entity (202607860000) → must be companyScoped:true`).toBe(true);
      } else if (FLEET_STILL_GLOBAL.has(spec.table)) {
        expect(spec.companyScoped, `fleet.${spec.table} is still global (no operating_company_id) → must be companyScoped:false`).toBe(false);
      } else {
        throw new Error(`fleet.${spec.table} is not classified as per-entity or global — add it to this guard before shipping`);
      }
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
