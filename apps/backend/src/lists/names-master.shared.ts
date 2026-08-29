import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { EXCLUDE_PSEUDO_DRIVERS_SQL } from "../mdata/driver-pseudo-user.js";
import { EXCLUDE_ARCHIVED_DRIVERS_SQL, EXCLUDE_ARCHIVED_QBO_CUSTOMERS_SQL } from "../mdata/test-seed-archive.js";

export const NAMES_ENTITY_TYPES = ["customer", "vendor", "driver", "contact", "company"] as const;
export type NamesEntityType = (typeof NAMES_ENTITY_TYPES)[number];

export type NamesMasterRow = {
  entity_type: NamesEntityType;
  entity_id: string;
  display_name: string;
  primary_email: string | null;
  primary_phone: string | null;
  link_to_module_page: string;
  qbo_id: string | null;
  archived_at: string | null;
};

export const namesSearchQuerySchema = z.object({
  q: z.string().trim().max(200).optional().default(""),
  type: z.enum(["all", ...NAMES_ENTITY_TYPES]).default("all"),
  limit: z.coerce.number().int().min(1).max(50).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  include_archived: z.coerce.boolean().optional().default(false),
  operating_company_id: z.string().uuid(),
});

export const namesCountsQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  include_archived: z.coerce.boolean().optional().default(false),
});

export function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

export function validationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

export function buildArchivedFilter(includeArchived: boolean, column: string) {
  return includeArchived ? "TRUE" : `${column} IS NULL`;
}

export { EXCLUDE_ARCHIVED_DRIVERS_SQL, EXCLUDE_ARCHIVED_QBO_CUSTOMERS_SQL, EXCLUDE_PSEUDO_DRIVERS_SQL };
