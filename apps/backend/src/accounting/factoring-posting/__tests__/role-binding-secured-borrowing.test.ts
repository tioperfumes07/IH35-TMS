import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Resolve repo root from this test file (…/apps/backend/src/accounting/factoring-posting/__tests__) so the
// migration path is correct regardless of the vitest cwd (repo root vs apps/backend workspace).
const HERE = path.dirname(fileURLToPath(import.meta.url));

// Block 1-v3 Task 4.3 — in-repo role-binding assertion (no prod query). Reads the CODER-34 migration and
// confirms the secured-borrowing COA is typed per the CPA ruling: the reserve is an ASSET (due-from-factor),
// the advance is a LIABILITY (the borrowing). This closes the stale "factor_reserve_held expects LIABILITY"
// flag WITHOUT touching prod — that concern belongs to the Driver Damage-Escrow finding, not factoring.
const MIGRATION = path.resolve(
  HERE,
  "../../../../../../db/migrations/202607013000_factoring_secured_borrowing_coa_roles.sql"
);

const sql = readFileSync(MIGRATION, "utf8");

describe("factoring secured-borrowing COA role bindings (migration 202607013000)", () => {
  it("Factoring Reserves (#1230, role factor_reserve_held) is typed ASSET — not a liability", () => {
    // The seeded account row: '1230', 'Factoring Reserves', 'Asset', ...
    expect(sql).toMatch(/'1230',\s*'Factoring Reserves',\s*'Asset'/);
  });

  it("Factoring Advance (#2150, role factoring_advance_liability) is typed LIABILITY", () => {
    expect(sql).toMatch(/'2150',\s*'Factoring Advance',\s*'Liability'/);
  });

  it("Factoring Recoursed Invoices (#1220, role factoring_recoursed_ar) is an ASSET", () => {
    expect(sql).toMatch(/'1220',\s*'Factoring Recoursed Invoices',\s*'Asset'/);
  });

  it("all six CODER-34 secured-borrowing roles are registered in the chart_of_accounts_roles CHECK", () => {
    for (const role of [
      "factoring_advance_liability",
      "ar_assigned_to_factor",
      "factoring_recoursed_ar",
      "default_interest_expense",
      "factor_reserve_held",
      "factor_fee_expense",
    ]) {
      expect(sql).toContain(`'${role}'`);
    }
  });
});
