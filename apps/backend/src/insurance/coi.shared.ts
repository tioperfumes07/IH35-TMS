import { z } from "zod";

// INSURANCE REQUEST FEATURE (owner-authorized 2026-08-31): the original 5 values stayed exactly as
// they were (no existing row is ever rewritten); the 4 new values are the owner-specified lifecycle
// for the general request pipeline (requested -> sent -> acknowledged -> issued/declined). 'sent' is
// shared verbatim between both vocabularies -- it already meant the same thing in either.
export const INSURANCE_COI_STATUSES = [
  "pending",
  "sent",
  "received",
  "expired",
  "dismissed",
  "requested",
  "acknowledged",
  "issued",
  "declined",
] as const;

// The 3 request shapes this ONE pipeline covers (owner directive: "no second table"). unit_add is
// declared now so a future unit-add slice needs zero further schema/type change -- only a route.
export const INSURANCE_REQUEST_TYPES = ["customer_coi", "driver_add", "unit_add"] as const;

export const operatingCompanySchema = z.object({
  operating_company_id: z.string().uuid(),
});

export const listCoiRequestsQuerySchema = operatingCompanySchema.extend({
  customer_id: z.string().uuid().optional(),
  driver_id: z.string().uuid().optional(),
  unit_id: z.string().uuid().optional(),
  policy_id: z.string().uuid().optional(),
  status: z.enum(INSURANCE_COI_STATUSES).optional(),
  request_type: z.enum(INSURANCE_REQUEST_TYPES).optional(),
});

export const coiRequestIdParamsSchema = z.object({
  id: z.string().uuid(),
});

// Exactly one of customer_id/driver_id/unit_id, matching request_type -- mirrors the DB's own
// coi_request_target_check so a bad combination 400s before it ever reaches the constraint.
export const createCoiRequestBodySchema = z
  .object({
    operating_company_id: z.string().uuid(),
    request_type: z.enum(INSURANCE_REQUEST_TYPES).default("customer_coi"),
    customer_id: z.string().uuid().nullable().optional(),
    driver_id: z.string().uuid().nullable().optional(),
    unit_id: z.string().uuid().nullable().optional(),
    policy_id: z.string().uuid().nullable().optional(),
    notes: z.string().trim().max(4000).nullable().optional(),
    expires_at: z.string().date().nullable().optional(),
  })
  .superRefine((value, ctx) => {
    const targets = {
      customer_coi: value.customer_id,
      driver_add: value.driver_id,
      unit_add: value.unit_id,
    } as const;
    const wanted = targets[value.request_type];
    if (!wanted) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `request_type "${value.request_type}" requires its matching id (${
          value.request_type === "customer_coi" ? "customer_id" : value.request_type === "driver_add" ? "driver_id" : "unit_id"
        })`,
        path: [value.request_type === "customer_coi" ? "customer_id" : value.request_type === "driver_add" ? "driver_id" : "unit_id"],
      });
    }
    const others = (Object.keys(targets) as Array<keyof typeof targets>).filter((k) => k !== value.request_type);
    for (const other of others) {
      if (targets[other]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `request_type "${value.request_type}" must not also carry a value for ${other}`,
        });
      }
    }
  });

export const updateCoiRequestBodySchema = z
  .object({
    status: z.enum(INSURANCE_COI_STATUSES).optional(),
    notes: z.string().trim().max(4000).nullable().optional(),
    document_url: z.string().trim().url().nullable().optional(),
    expires_at: z.string().date().nullable().optional(),
    responded_at: z.string().datetime({ offset: true }).nullable().optional(),
    acknowledged_at: z.string().datetime({ offset: true }).nullable().optional(),
    policy_id: z.string().uuid().nullable().optional(),
    // LAW-EDITABLE-BY-PERMISSION-ALWAYS-TRACEABLE-2026-09-01: "every authorized edit writes an
    // audit record: actor, timestamp, before, after, reason." `reason` is optional on a normal
    // in-flow status move (the status transition itself is the reason) but is where a human
    // explains an out-of-band correction -- carried straight into the audit event, never stored on
    // the row itself (the row has no `reason` column; the audit trail is the record of why).
    reason: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "at least one field is required" });

export const sendCoiRequestBodySchema = z
  .object({
    // LAW-EDITABLE-BY-PERMISSION-ALWAYS-TRACEABLE-2026-09-01: a request already sent/acknowledged/
    // issued/declined is blocked from a plain re-send for most roles (avoids an accidental double-
    // send) -- but that block is NOT a hard wall. Owner/Accountant may force a resend, and it must
    // be traceable, so `reason` is required whenever `force` is true.
    force: z.boolean().optional(),
    reason: z.string().trim().max(2000).optional(),
  })
  .refine((value) => !value.force || (value.reason && value.reason.length > 0), {
    message: "reason is required when force is true",
    path: ["reason"],
  });

export type CoiRequestStatus = (typeof INSURANCE_COI_STATUSES)[number];
export type InsuranceRequestType = (typeof INSURANCE_REQUEST_TYPES)[number];
