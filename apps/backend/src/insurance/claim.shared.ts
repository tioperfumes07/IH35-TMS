import { z } from "zod";

export const INSURANCE_CLAIM_STATUSES = ["open", "investigating", "approved", "denied", "paid", "closed"] as const;
export const INSURANCE_LAWSUIT_STATUSES = ["filed", "active", "settled", "dismissed", "judgment"] as const;

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
});

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
  })
  .refine((value) => Object.keys(value).length > 0, { message: "at least one field is required" });

export const listLawsuitsQuerySchema = operatingCompanySchema.extend({
  status: z.enum(INSURANCE_LAWSUIT_STATUSES).optional(),
  claim_id: z.string().uuid().optional(),
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
