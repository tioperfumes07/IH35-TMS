import { z } from "zod";

export const INSURANCE_CLAIM_STATUSES = ["open", "investigating", "approved", "denied", "paid", "closed"] as const;
export const INSURANCE_LAWSUIT_STATUSES = ["filed", "active", "settled", "dismissed", "judgment"] as const;

/**
 * WIZARD-CLAIM-ECONOMICS-DEPTH slice 2 (202607730000, HOLD-FOR-JORGE — financial cluster, not yet
 * applied on prod). "undetermined" is the only safe default — a fresh claim is never defaulted to a
 * specific fault finding (mirrors safety.accident_reports.at_fault precedent).
 */
export const INSURANCE_CLAIM_FAULT_VALUES = ["undetermined", "company", "third_party", "shared"] as const;

/**
 * Owner lock #1 (2026-07-22, master plan §0.1 Example A2): driver-deductible recovery rail is ALWAYS
 * ASK — 'ask' is the permanent neutral "not decided yet" state and must never be silently advanced by
 * any migration/backfill/UI default. UI must force an explicit choice before allowing 'ask' to persist
 * past claim creation for a claim with driver_responsible = true.
 */
export const INSURANCE_CLAIM_RECOVERY_RAIL_VALUES = ["escrow", "settlement", "split", "ask"] as const;

/**
 * Owner lock #2 (2026-07-22, Choice Z): uninsured/company-funded repair books treatment is ALWAYS ASK
 * (expense vs capitalize) — NO dollar threshold anywhere. 'ask' is the permanent neutral default.
 */
export const INSURANCE_CLAIM_REPAIR_BOOKS_TREATMENT_VALUES = ["expense", "capitalize", "ask"] as const;

export const operatingCompanySchema = z.object({
  operating_company_id: z.string().uuid(),
});

export const claimIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const lawsuitIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const listClaimsQuerySchema = operatingCompanySchema.extend({
  policy_id: z.string().uuid().optional(),
  status: z.enum(INSURANCE_CLAIM_STATUSES).optional(),
  asset_id: z.string().uuid().optional(),
  /** Reverse drill: insurance.claim.driver_id → mdata.drivers */
  driver_id: z.string().uuid().optional(),
  /** Reverse drill via mdata.assets.unit_id (claim stores asset_id). */
  unit_id: z.string().uuid().optional(),
  /** Reverse drill: insurance.claim.load_id → mdata.loads (WIZARD-CLAIM-ECONOMICS-DEPTH slice 1). */
  load_id: z.string().uuid().optional(),
  /** Reverse drill: mdata.equipment (trailer) -> insurance.claim.trailer_id (slice 2, 202607730000). */
  trailer_id: z.string().uuid().optional(),
});

/** Forward graph FKs (prod-live via 202607410000) — link existing hubs only; never invent amounts. */
const claimGraphFkFields = {
  accident_report_id: z.string().uuid().nullable().optional(),
  load_id: z.string().uuid().nullable().optional(),
  driver_id: z.string().uuid().nullable().optional(),
} as const;

/**
 * WIZARD-CLAIM-ECONOMICS-DEPTH slice 2 economics fields (202607730000, HOLD-FOR-JORGE — schema not yet
 * applied on prod). Pure capture — no GL posting reads/writes these in this slice.
 */
const claimEconomicsFields = {
  fault: z.enum(INSURANCE_CLAIM_FAULT_VALUES).optional(),
  driver_responsible: z.boolean().nullable().optional(),
  trailer_id: z.string().uuid().nullable().optional(),
  deductible_cents: z.number().int().nonnegative().optional(),
  recovery_rail: z.enum(INSURANCE_CLAIM_RECOVERY_RAIL_VALUES).optional(),
  repair_books_treatment: z.enum(INSURANCE_CLAIM_REPAIR_BOOKS_TREATMENT_VALUES).optional(),
} as const;

export const createClaimBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  claim_number: z.string().trim().min(1).max(120),
  policy_id: z.string().uuid(),
  asset_id: z.string().uuid().nullable().optional(),
  accident_date: z.string().date(),
  reported_date: z.string().date(),
  status: z.enum(INSURANCE_CLAIM_STATUSES).optional(),
  amount_claimed_cents: z.number().int().nonnegative().default(0),
  amount_paid_cents: z.number().int().nonnegative().default(0),
  adjuster_name: z.string().trim().max(250).nullable().optional(),
  adjuster_email: z.string().trim().email().max(320).nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
  ...claimGraphFkFields,
  ...claimEconomicsFields,
});

export const updateClaimBodySchema = z
  .object({
    claim_number: z.string().trim().min(1).max(120).optional(),
    policy_id: z.string().uuid().optional(),
    asset_id: z.string().uuid().nullable().optional(),
    accident_date: z.string().date().optional(),
    reported_date: z.string().date().optional(),
    status: z.enum(INSURANCE_CLAIM_STATUSES).optional(),
    amount_claimed_cents: z.number().int().nonnegative().optional(),
    amount_paid_cents: z.number().int().nonnegative().optional(),
    adjuster_name: z.string().trim().max(250).nullable().optional(),
    adjuster_email: z.string().trim().email().max(320).nullable().optional(),
    notes: z.string().trim().max(4000).nullable().optional(),
    ...claimGraphFkFields,
    ...claimEconomicsFields,
  })
  .refine((value) => Object.keys(value).length > 0, { message: "at least one field is required" });

export const listLawsuitsQuerySchema = operatingCompanySchema.extend({
  status: z.enum(INSURANCE_LAWSUIT_STATUSES).optional(),
  claim_id: z.string().uuid().optional(),
  policy_id: z.string().uuid().optional(),
  driver_id: z.string().uuid().optional(),
  unit_id: z.string().uuid().optional(),
});

export const createLawsuitBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  case_number: z.string().trim().min(1).max(120),
  plaintiff: z.string().trim().min(1).max(250),
  defendant: z.string().trim().min(1).max(250),
  court_name: z.string().trim().min(1).max(250),
  filed_date: z.string().date(),
  status: z.enum(INSURANCE_LAWSUIT_STATUSES).optional(),
  claim_id: z.string().uuid().nullable().optional(),
  demand_cents: z.number().int().nonnegative().default(0),
  settlement_cents: z.number().int().nonnegative().default(0),
  attorney_name: z.string().trim().max(250).nullable().optional(),
  attorney_email: z.string().trim().email().max(320).nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
});

export const updateLawsuitBodySchema = z
  .object({
    case_number: z.string().trim().min(1).max(120).optional(),
    plaintiff: z.string().trim().min(1).max(250).optional(),
    defendant: z.string().trim().min(1).max(250).optional(),
    court_name: z.string().trim().min(1).max(250).optional(),
    filed_date: z.string().date().optional(),
    status: z.enum(INSURANCE_LAWSUIT_STATUSES).optional(),
    claim_id: z.string().uuid().nullable().optional(),
    demand_cents: z.number().int().nonnegative().optional(),
    settlement_cents: z.number().int().nonnegative().optional(),
    attorney_name: z.string().trim().max(250).nullable().optional(),
    attorney_email: z.string().trim().email().max(320).nullable().optional(),
    notes: z.string().trim().max(4000).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "at least one field is required" });

export type InsuranceClaimStatus = (typeof INSURANCE_CLAIM_STATUSES)[number];
export type InsuranceLawsuitStatus = (typeof INSURANCE_LAWSUIT_STATUSES)[number];
export type InsuranceClaimFault = (typeof INSURANCE_CLAIM_FAULT_VALUES)[number];
export type InsuranceClaimRecoveryRail = (typeof INSURANCE_CLAIM_RECOVERY_RAIL_VALUES)[number];
export type InsuranceClaimRepairBooksTreatment = (typeof INSURANCE_CLAIM_REPAIR_BOOKS_TREATMENT_VALUES)[number];
