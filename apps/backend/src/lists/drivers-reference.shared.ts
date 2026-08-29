import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";

export type DriversReferenceConfig = {
  urlSegment: string;
  tableName: string;
  displayName: string;
};

export const DRIVERS_REFERENCE_CONFIGS: DriversReferenceConfig[] = [
  { urlSegment: "license-classes", tableName: "license_classes", displayName: "License Classes" },
  { urlSegment: "endorsements", tableName: "cdl_endorsements", displayName: "CDL Endorsements" },
  { urlSegment: "restrictions", tableName: "cdl_restrictions", displayName: "CDL Restrictions" },
  { urlSegment: "medical-card-status", tableName: "medical_card_statuses", displayName: "Medical Card Status" },
  { urlSegment: "employment-status", tableName: "employment_statuses", displayName: "Employment Status" },
];

const TABLE_GUARD = /^[a-z_]+$/;
const SEGMENT_GUARD = /^[a-z-]+$/;

export function assertReferenceConfig(config: DriversReferenceConfig) {
  if (!TABLE_GUARD.test(config.tableName)) {
    throw new Error(`invalid_table_name_for_drivers_reference: ${config.tableName}`);
  }
  if (!SEGMENT_GUARD.test(config.urlSegment)) {
    throw new Error(`invalid_url_segment_for_drivers_reference: ${config.urlSegment}`);
  }
}

export const listQuerySchema = z.object({
  include_archived: z.coerce.boolean().optional(),
  search: z.string().trim().optional(),
});

export const createBodySchema = z.object({
  code: z.string().trim().min(1).max(32),
  label: z.string().trim().min(1).max(160),
  sort_order: z.coerce.number().int().min(0).max(10000).optional(),
});

export const updateBodySchema = z
  .object({
    code: z.string().trim().min(1).max(32).optional(),
    label: z.string().trim().min(1).max(160).optional(),
    sort_order: z.coerce.number().int().min(0).max(10000).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "at least one field is required" });

export const idParamSchema = z.object({
  id: z.string().uuid(),
});

export function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

export function validationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

export function selectColumns() {
  return `
    id::text,
    code,
    label,
    sort_order::int,
    archived_at::text,
    created_at::text,
    updated_at::text
  `;
}
