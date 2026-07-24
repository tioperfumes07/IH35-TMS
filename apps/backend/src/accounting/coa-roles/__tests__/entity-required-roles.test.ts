import { describe, expect, it } from "vitest";
import {
  OPTIONAL_COA_ROLES,
  assertOptionalNotRequired,
  assertRequiredSubsetOfCanonical,
  requiredCoaRolesForCompanyCode,
} from "../entity-required-roles.js";

describe("entity-required-roles (owner 2026-07-23)", () => {
  it("keeps unused OO-style recoveries optional (not required)", () => {
    for (const role of [
      "lease_recovery",
      "insurance_recovery",
      "fuel_advance_recovery",
      "other_recovery",
      "sales_tax_payable",
      "cash_basis_adjustment_equity",
    ] as const) {
      expect(OPTIONAL_COA_ROLES).toContain(role);
      expect(requiredCoaRolesForCompanyCode("TRANSP")).not.toContain(role);
      expect(requiredCoaRolesForCompanyCode("USMCA")).not.toContain(role);
      expect(requiredCoaRolesForCompanyCode("TRK")).not.toContain(role);
    }
  });

  it("still requires company-driver ops on TRANSP/USMCA", () => {
    for (const code of ["TRANSP", "USMCA"] as const) {
      const req = requiredCoaRolesForCompanyCode(code);
      expect(req).toContain("cash_dip");
      expect(req).toContain("advance_recovery");
      expect(req).toContain("damage_recovery");
      expect(req).toContain("reimbursement_expense");
      expect(req).toContain("escrow_liability_default");
    }
  });

  it("TRK requires lease suite, not factoring or driver recoveries", () => {
    const req = requiredCoaRolesForCompanyCode("TRK");
    expect(req).toContain("rental_income");
    expect(req).toContain("lease_receivable");
    expect(req).not.toContain("factoring_advance_liability");
    expect(req).not.toContain("advance_recovery");
  });

  it("TRANSP requires factoring; USMCA does not", () => {
    expect(requiredCoaRolesForCompanyCode("TRANSP")).toContain("factoring_advance_liability");
    expect(requiredCoaRolesForCompanyCode("USMCA")).not.toContain("factoring_advance_liability");
  });

  it("required sets are a subset of canonical roles; optional never required", () => {
    for (const code of ["TRANSP", "TRK", "USMCA"] as const) {
      assertRequiredSubsetOfCanonical(requiredCoaRolesForCompanyCode(code));
    }
    expect(() => assertOptionalNotRequired()).not.toThrow();
  });
});
