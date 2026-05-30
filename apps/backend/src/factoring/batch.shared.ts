import { z } from "zod";

export const FACTORING_BATCH_STATUSES = ["draft", "submitted", "funded", "rejected"] as const;
export type FactoringBatchStatus = (typeof FACTORING_BATCH_STATUSES)[number];

export const factoringBatchIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const factoringBatchCompanyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

export const factoringBatchListQuerySchema = factoringBatchCompanyQuerySchema.extend({
  status: z.enum(FACTORING_BATCH_STATUSES).optional(),
});

export const factoringBatchCreateBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  invoice_ids: z.array(z.string().uuid()).min(1).max(500),
});

export const factoringBatchSubmitParamsSchema = z.object({
  id: z.string().uuid(),
});

export const factoringBatchSubmitQuerySchema = factoringBatchCompanyQuerySchema;

export type BatchInvoiceLite = {
  id: string;
  total_cents: number;
};

export type BatchTotals = {
  total_face_cents: number;
  expected_advance_cents: number;
  expected_fee_cents: number;
};

