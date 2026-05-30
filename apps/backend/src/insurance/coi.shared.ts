import { z } from "zod";

export const INSURANCE_COI_STATUSES = ["pending", "sent", "received", "expired", "dismissed"] as const;

export const operatingCompanySchema = z.object({
  operating_company_id: z.string().uuid(),
});

export const listCoiRequestsQuerySchema = operatingCompanySchema.extend({
  customer_id: z.string().uuid().optional(),
  status: z.enum(INSURANCE_COI_STATUSES).optional(),
});

export const coiRequestIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const createCoiRequestBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  customer_id: z.string().uuid(),
  policy_id: z.string().uuid().nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
  expires_at: z.string().date().nullable().optional(),
});

export const updateCoiRequestBodySchema = z
  .object({
    status: z.enum(INSURANCE_COI_STATUSES).optional(),
    notes: z.string().trim().max(4000).nullable().optional(),
    document_url: z.string().trim().url().nullable().optional(),
    expires_at: z.string().date().nullable().optional(),
    responded_at: z.string().datetime({ offset: true }).nullable().optional(),
    policy_id: z.string().uuid().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "at least one field is required" });

export type CoiRequestStatus = (typeof INSURANCE_COI_STATUSES)[number];
