/**
 * Entity-aware required CoA roles (owner law 2026-07-23; recoveries refined 2026-07-23 evening).
 *
 * Validate must NOT demand every COA_ROLE_VALUES key on every opco:
 * - TRK = asset lessor (leases) — no factoring / driver ops
 * - TRANSP = operating carrier + Ch.11 DIP + Faro factoring
 * - USMCA = future carrier (TMS-only launch) — no Faro factoring suite required yet
 *
 * Owner 2026-07-23: company-owned assets / no owner-operators → do NOT require
 * lease_recovery, insurance_recovery, fuel_advance_recovery, other_recovery.
 * Those stay designatable (posters still resolve them if a settlement line uses them).
 *
 * Also optional: sales_tax_payable, cash_basis_adjustment_equity (freight not sales-taxed;
 * cash-basis equity plug only if CPA creates a dedicated account).
 */
import { COA_ROLE_VALUES, type CoaRole } from "./resolver.service.js";

const CORE: readonly CoaRole[] = [
  "ar_control",
  "ap_control",
  "cash_clearing",
  "undeposited_funds",
  "revenue_default",
  "expense_default",
  "retained_earnings",
  "uncategorized_expense",
  "cash_dip",
];

/** Company-driver ops that IH35 actually runs (cash advance, damage, escrow, pay, reimburse). */
const CARRIER_DRIVER: readonly CoaRole[] = [
  "escrow_liability_default",
  "driver_pay_expense",
  "driver_payroll_clearing",
  "reimbursement_expense",
  "advance_recovery",
  "damage_recovery",
  "abandonment_chargeback_recovery",
];

const FACTORING_TRANSP: readonly CoaRole[] = [
  "factoring_advance_liability",
  "ar_assigned_to_factor",
  "factoring_recoursed_ar",
  "default_interest_expense",
  "factor_reserve_held",
  "factor_fee_expense",
  "factor_reserve_default",
];

const LEASE_TRK: readonly CoaRole[] = [
  "rental_income",
  "lease_receivable",
  "interest_income",
  "gain_loss_on_disposal",
];

const PROPERTY_TAX: readonly CoaRole[] = ["property_tax_expense", "property_tax_payable"];

/**
 * Designatable everywhere but not required for validate green.
 * Includes unused OO-style recoveries (owner: no owner-operators / no those deductions).
 */
export const OPTIONAL_COA_ROLES: readonly CoaRole[] = [
  "sales_tax_payable",
  "cash_basis_adjustment_equity",
  "lease_recovery",
  "insurance_recovery",
  "fuel_advance_recovery",
  "other_recovery",
];

function uniq(roles: readonly CoaRole[]): CoaRole[] {
  return Array.from(new Set(roles));
}

export type CompanyCode = "TRANSP" | "TRK" | "USMCA" | string;

export function requiredCoaRolesForCompanyCode(code: CompanyCode): readonly CoaRole[] {
  const c = String(code ?? "").trim().toUpperCase();
  if (c === "TRK") {
    return uniq([...CORE, ...LEASE_TRK, ...PROPERTY_TAX]);
  }
  if (c === "USMCA") {
    return uniq([...CORE, ...CARRIER_DRIVER, ...PROPERTY_TAX]);
  }
  // TRANSP + unknown codes → full carrier + factoring (fail closed toward operating carrier)
  return uniq([...CORE, ...CARRIER_DRIVER, ...FACTORING_TRANSP, ...PROPERTY_TAX]);
}

export function assertRequiredSubsetOfCanonical(required: readonly CoaRole[]): void {
  const set = new Set<string>(COA_ROLE_VALUES);
  for (const role of required) {
    if (!set.has(role)) {
      throw new Error(`entity-required-roles: unknown role ${role}`);
    }
  }
}

/** Optional roles must never appear in an entity required set (guard helper). */
export function assertOptionalNotRequired(): void {
  for (const code of ["TRANSP", "TRK", "USMCA"] as const) {
    const required = new Set(requiredCoaRolesForCompanyCode(code));
    for (const opt of OPTIONAL_COA_ROLES) {
      if (required.has(opt)) {
        throw new Error(`entity-required-roles: optional role ${opt} must not be required for ${code}`);
      }
    }
  }
}
