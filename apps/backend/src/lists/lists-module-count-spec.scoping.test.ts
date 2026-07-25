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
    "equipment_types", // converted by 202607880000 (parent + line-item templates)
  ]);
  // Still global (no operating_company_id column) — companyScoped MUST stay false or the count 42703s.
  const FLEET_STILL_GLOBAL = new Set(["tire_positions"]);

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

  // Added 2026-07-25 with the count-spec completion. The SHARED-CANONICAL trap: a table can HAVE
  // operating_company_id and still need companyScoped:false, because every row is NULL by design and
  // its policy reads `opco IS NULL OR = current_setting(...)`. Filtering on the column would count 0.
  // These three values are prod-verified (Neon lucia, br-fancy-credit-akjnd07a) and must not be
  // "corrected" by a future reader without re-checking prod.
  it("accounting global / shared-canonical catalogs stay companyScoped:false", () => {
    const GLOBAL_BY_PROD = new Map<string, string>([
      ["journal_entry_types", "no operating_company_id; policy qual:true — global reference taxonomy"],
      ["account_types", "no operating_company_id; RLS is OFF entirely on prod — global"],
      ["detail_types", "HAS operating_company_id but ALL rows are NULL (shared canonical system set); policy is `opco IS NULL OR = GUC`. companyScoped:true would count 0."],
      ["accounts", "entity correctness comes from FORCE RLS + the GUC, not an explicit filter"],
      ["classes", "as accounts"],
      ["items", "as accounts"],
      ["payment_terms", "no operating_company_id on prod — global"],
      ["posting_templates", "no operating_company_id on prod — global"],
      ["account_role_bindings", "has opco but 0 rows; counted under RLS"],
    ]);
    for (const spec of LISTS_MODULE_COUNT_SPECS.accounting ?? []) {
      const reason = GLOBAL_BY_PROD.get(spec.table);
      if (reason) {
        expect(spec.companyScoped, `accounting.${spec.table} must stay companyScoped:false — ${reason}`).toBe(false);
      } else {
        expect(spec.companyScoped, `accounting.${spec.table} is per-entity on prod → companyScoped:true`).toBe(true);
      }
    }
  });

  it("safety / dispatch / drivers catalogs.* rows are per-entity (reference.* stay global)", () => {
    for (const domain of ["safety", "dispatch", "drivers"] as const) {
      for (const spec of LISTS_MODULE_COUNT_SPECS[domain] ?? []) {
        if (spec.schema === "reference") {
          expect(spec.companyScoped, `${domain}.${spec.table} (reference) is global`).toBe(false);
        } else {
          expect(spec.companyScoped, `${domain}.${spec.table} (catalogs) is per-entity on prod`).toBe(true);
        }
      }
    }
  });
});
