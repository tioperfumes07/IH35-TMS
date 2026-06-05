import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { initializeFmcsaSaferVerificationCron } from "./fmcsa-safer-cron.js";
import {
  computeSaferCoverage,
  verifySaferEntity,
  type SaferEntityType,
} from "./fmcsa-safer-verifier.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const entityParamsSchema = z.object({
  entity_type: z.enum(["customer", "vendor"]),
  entity_id: z.string().uuid(),
});

const verifyNowSchema = companyQuerySchema.extend({
  entity_type: z.enum(["customer", "vendor"]),
  entity_id: z.string().uuid(),
  force: z.boolean().optional(),
});

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

function currentUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function canMutate(role: string) {
  return ["Owner", "Administrator", "Manager", "Safety", "Dispatcher"].includes(role);
}

async function withCompanyScope<T>(userId: string, role: string, companyId: string, fn: (client: DbClient) => Promise<T>) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [companyId]);
    await client.query(`SELECT set_config('app.user_role', $1, true)`, [role]);
    return fn(client as DbClient);
  });
}

const ENTITY_TABLE: Record<SaferEntityType, string> = {
  customer: "mdata.customers",
  vendor: "mdata.vendors",
};

async function loadEntitySaferStatus(client: DbClient, entityType: SaferEntityType, entityId: string, companyId: string) {
  const table = ENTITY_TABLE[entityType];
  const res = await client.query(
    `
      SELECT
        id::text,
        mc_number,
        dot_number,
        safer_status,
        safer_authority_status,
        safer_oos_status,
        safer_verified_at::text
      FROM ${table}
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
      LIMIT 1
    `,
    [entityId, companyId]
  );
  return res.rows[0] ?? null;
}

export async function registerFmcsaSaferRoutes(app: FastifyInstance) {
  initializeFmcsaSaferVerificationCron(app);

  app.get("/api/v1/compliance/fmcsa-safer/status", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    const payload = await withCompanyScope(user.uuid, user.role, query.data.operating_company_id, async (client) => {
      const coverage = await computeSaferCoverage(client, query.data.operating_company_id);
      const staleCustomers = await client.query<{ count: string }>(
        `
          SELECT COUNT(*)::text AS count
          FROM mdata.customers
          WHERE operating_company_id = $1::uuid
            AND deactivated_at IS NULL
            AND (
              NULLIF(trim(COALESCE(mc_number, '')), '') IS NOT NULL
              OR NULLIF(trim(COALESCE(dot_number, '')), '') IS NOT NULL
            )
            AND (
              safer_verified_at IS NULL
              OR safer_verified_at < now() - interval '7 days'
            )
        `,
        [query.data.operating_company_id]
      );
      const staleVendors = await client.query<{ count: string }>(
        `
          SELECT COUNT(*)::text AS count
          FROM mdata.vendors
          WHERE operating_company_id = $1::uuid
            AND deactivated_at IS NULL
            AND (
              NULLIF(trim(COALESCE(mc_number, '')), '') IS NOT NULL
              OR NULLIF(trim(COALESCE(dot_number, '')), '') IS NOT NULL
            )
            AND (
              safer_verified_at IS NULL
              OR safer_verified_at < now() - interval '7 days'
            )
        `,
        [query.data.operating_company_id]
      );
      return {
        ...coverage,
        stale_customers: Number(staleCustomers.rows[0]?.count ?? 0),
        stale_vendors: Number(staleVendors.rows[0]?.count ?? 0),
        generated_at: new Date().toISOString(),
      };
    });

    return reply.send(payload);
  });

  app.get("/api/v1/compliance/fmcsa-safer/entity/:entity_type/:entity_id", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const params = entityParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    const entity = await withCompanyScope(user.uuid, user.role, query.data.operating_company_id, (client) =>
      loadEntitySaferStatus(client, params.data.entity_type, params.data.entity_id, query.data.operating_company_id)
    );
    if (!entity) return reply.code(404).send({ error: "entity_not_found" });
    return reply.send({ entity_type: params.data.entity_type, entity_id: params.data.entity_id, safer: entity });
  });

  app.post("/api/v1/compliance/fmcsa-safer/verify-now", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const body = verifyNowSchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const result = await withCompanyScope(user.uuid, user.role, body.data.operating_company_id, async (client) => {
      const verified = await verifySaferEntity(client, {
        entityType: body.data.entity_type,
        entityId: body.data.entity_id,
        operatingCompanyId: body.data.operating_company_id,
        force: body.data.force ?? true,
      });
      await appendCrudAudit(
        client,
        user.uuid,
        "compliance.fmcsa_safer.verify_now",
        {
          resource_type: ENTITY_TABLE[body.data.entity_type],
          resource_id: body.data.entity_id,
          operating_company_id: body.data.operating_company_id,
          safer_status: verified.safer_status,
          safer_authority_status: verified.safer_authority_status,
          safer_oos_status: verified.safer_oos_status,
        },
        verified.safer_status === "verified" ? "info" : "warning",
        "P8-COMP-4-FMCSA-SAFER"
      );
      return verified;
    }).catch((error: Error) => {
      if (error.message === "entity_not_found") return null;
      throw error;
    });

    if (!result) return reply.code(404).send({ error: "entity_not_found" });
    return reply.send(result);
  });
}
