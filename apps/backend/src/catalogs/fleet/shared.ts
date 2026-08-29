import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../auth/session-middleware.js";
import { withCurrentUser } from "../../auth/db.js";
import { assertCompanyMembership } from "../../_helpers/company-membership-guard.js";

export const listQuerySchema = z.object({
  operating_company_id: z.string().uuid().optional(),
  search: z.string().trim().min(1).max(120).optional(),
  is_active: z.enum(["true", "false", "all"]).default("true"),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid().optional(),
});

// Per-entity variants: operating_company_id is REQUIRED. Used by catalogs the factory runs in
// companyScoped mode — a missing entity must be a 400, never a silent cross-entity/global read.
export const companyScopedListQuerySchema = listQuerySchema.extend({
  operating_company_id: z.string().uuid(),
});

export const companyScopedCompanyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

// Mirror of the canonical dispatch-catalog scope (catalogs/dispatch/shared.ts): validate the caller
// is a member of the entity, then set the app.operating_company_id GUC the FORCE-RLS company_scope
// policy reads, so a per-entity catalog query is both membership-checked AND RLS-scoped.
export async function withCompanyScope<T>(userId: string, operatingCompanyId: string, fn: (client: DbClient) => Promise<T>) {
  return withCurrentUser(userId, async (client) => {
    await assertCompanyMembership(client, userId, operatingCompanyId);
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [operatingCompanyId]);
    return fn(client as DbClient);
  });
}

export const idParamSchema = z.object({
  id: z.string().uuid(),
});

export function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return reply;
  return req.user;
}

export function validationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}
