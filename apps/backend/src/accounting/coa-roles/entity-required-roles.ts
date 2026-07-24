/**
 * Entity-aware required CoA roles (owner law 2026-07-23).
 *
 * Validate must NOT demand every COA_ROLE_VALUES key on every opco:
 * - TRK = asset lessor (leases) — no factoring / driver ops
 * - TRANSP = operating carrier + Ch.11 DIP + Faro factoring
 * - USMCA = future carrier (TMS-only launch) — no Faro factoring suite required yet
 *
 * Optional roles (sales_tax_payable, cash_basis_adjustment_equity) stay designatable
 * but are NOT required until owner creates dedicated accounts.
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

const CARRIER_DRIVER: readonly CoaRole[] = [
  "escrow_liability_default",
  "driver_pay_expense",
  "driver_payroll_clearing",
  "reimbursement_expense",
  "advance_recovery",
  "damage_recovery",
  "lease_recovery",
  "insurance_recovery",
  "fuel_advance_recovery",
  "other_recovery",
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

/** Designatable everywhere but not required for validate green. */
export const OPTIONAL_COA_ROLES: readonly CoaRole[] = [
  "sales_tax_payable",
  "cash_basis_adjustment_equity",
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
