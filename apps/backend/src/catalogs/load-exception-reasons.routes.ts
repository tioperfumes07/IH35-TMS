// LEAD ITEM 1 (2026-09-11 22:30 UTC): catalogs.load_exception_reasons — CC-2's Truck Line needs
// this catalog; the migration/catalog lane is CC-1's per the owner's 17:25 CT ruling. A per-entity,
// FORCED-RLS operational-exception taxonomy for loads (breakdown, accident, weather, border hold,
// detention, etc.) — a SEPARATE domain from catalogs.load_cancellation_reasons (a load is cancelled
// vs. a load is delayed/exceptioned but still active), mirroring the existing separation between
// catalogs.load_cancellation_reasons and the financial catalogs.cancellation_reasons.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { resolveOperatingCompanyId } from "../auth/operating-company-scope.js";
import { z } from "zod";
import { appendCrudAudit, buildPatchChanges } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const idParamSchema = z.object({ id: z.string().uuid() });

const listQuerySchema = z.object({
  operating_company_id: z.string().uuid().optional(),
  include_inactive: z.enum(["true", "false"]).optional(),
});

const CODE_REGEX = /^[a-z][a-z0-9_]+$/;

export const createExceptionReasonBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  code: z
    .string()
    .trim()
    .toLowerCase()
    .regex(CODE_REGEX, "code must be lowercase letters/digits/underscores")
    .min(2)
    .max(80),
  name: z.string().trim().min(1).max(160),
  applies_to: z.string().trim().min(1).max(40).default("load"),
  linked_module: z.string().trim().max(80).nullable().optional(),
  sort_order: z.number().int().min(0).max(10000).default(0),
});

const updateExceptionReasonBodySchema = z
  .object({
    code: z.string().trim().toLowerCase().regex(CODE_REGEX).min(2).max(80).optional(),
    name: z.string().trim().min(1).max(160).optional(),
    applies_to: z.string().trim().min(1).max(40).optional(),
    linked_module: z.string().trim().max(80).nullable().optional(),
    sort_order: z.number().int().min(0).max(10000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "at least one field is required" });

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function ensureCatalogWriteRole(req: FastifyRequest, reply: FastifyReply) {
  const user = currentAuthUser(req, reply);
  if (!user) return null;
  if (!["Owner", "Administrator", "Manager"].includes(user.role)) {
    reply.code(403).send({ error: "forbidden" });
    return null;
  }
  return user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

export async function registerLoadExceptionReasonRoutes(app: FastifyInstance) {
  app.get("/api/v1/catalogs/load-exception-reasons", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const parsedQuery = listQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

    const includeInactive = parsedQuery.data.include_inactive === "true";
    const rows = await withCurrentUser(user.uuid, async (client) => {
      const operatingCompanyId = await resolveOperatingCompanyId(
        client,
        user.uuid,
        parsedQuery.data.operating_company_id ?? null
      );
      if (!operatingCompanyId) return [];

      const values: unknown[] = [operatingCompanyId];
      let whereClause = `WHERE operating_company_id = $1::uuid`;
      if (!includeInactive) whereClause += ` AND is_active = true`;

      const res = await client.query(
        `
          SELECT id, operating_company_id, code, name, applies_to, linked_module, sort_order, is_active, created_at
          FROM catalogs.load_exception_reasons
          ${whereClause}
          ORDER BY sort_order, name
        `,
        values
      );
      return res.rows;
    });

    return { reasons: rows };
  });

  app.post("/api/v1/catalogs/load-exception-reasons", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = ensureCatalogWriteRole(req, reply);
    if (!user) return;
    const parsedBody = createExceptionReasonBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const b = parsedBody.data;

    try {
      const created = await withCurrentUser(user.uuid, async (client) => {
        const res = await client.query(
          `
            INSERT INTO catalogs.load_exception_reasons (
              operating_company_id, code, name, applies_to, linked_module, sort_order
            ) VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, operating_company_id, code, name, applies_to, linked_module, sort_order, is_active, created_at
          `,
          [b.operating_company_id, b.code, b.name, b.applies_to, b.linked_module ?? null, b.sort_order]
        );
        const row = res.rows[0];
        await appendCrudAudit(
          client,
          user.uuid,
          "catalogs.load_exception_reason.created",
          {
            resource_id: row.id,
            resource_type: "catalogs.load_exception_reasons",
            operating_company_id: row.operating_company_id,
            code: row.code,
          },
          "info",
          "LEAD-ITEM-1-LOAD-EXCEPTION-REASONS"
        );
        return row;
      });

      return reply.code(201).send({ reason: created });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "23505") return reply.code(409).send({ error: "exception_reason_code_conflict" });
      if (code === "23503") return reply.code(400).send({ error: "invalid_foreign_key" });
      throw error;
    }
  });

  app.patch<{ Params: { id: string } }>("/api/v1/catalogs/load-exception-reasons/:id", async (req, reply) => {
    const user = ensureCatalogWriteRole(req, reply);
    if (!user) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = updateExceptionReasonBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const b = parsedBody.data;

    const fields: string[] = [];
    const values: unknown[] = [];
    const add = (name: string, value: unknown) => {
      values.push(value);
      fields.push(`${name} = $${values.length}`);
    };

    if ("code" in b) add("code", b.code);
    if ("name" in b) add("name", b.name);
    if ("applies_to" in b) add("applies_to", b.applies_to);
    if ("linked_module" in b) add("linked_module", b.linked_module ?? null);
    if ("sort_order" in b) add("sort_order", b.sort_order);
    values.push(parsedParams.data.id);

    try {
      const updated = await withCurrentUser(user.uuid, async (client) => {
        const oldRes = await client.query(
          `
            SELECT id, operating_company_id, code, name, applies_to, linked_module, sort_order, is_active, created_at
            FROM catalogs.load_exception_reasons
            WHERE id = $1
            LIMIT 1
          `,
          [parsedParams.data.id]
        );
        const oldRow = oldRes.rows[0] ?? null;
        if (!oldRow) return null;

        const res = await client.query(
          `
            UPDATE catalogs.load_exception_reasons
            SET ${fields.join(", ")}
            WHERE id = $${values.length}
            RETURNING id, operating_company_id, code, name, applies_to, linked_module, sort_order, is_active, created_at
          `,
          values
        );
        const row = res.rows[0] ?? null;
        if (!row) return null;
        const changes = buildPatchChanges(
          b as unknown as Record<string, unknown>,
          oldRow as Record<string, unknown>,
          row as Record<string, unknown>
        );
        await appendCrudAudit(
          client,
          user.uuid,
          "catalogs.load_exception_reason.updated",
          { resource_id: row.id, resource_type: "catalogs.load_exception_reasons", changes },
          "info",
          "LEAD-ITEM-1-LOAD-EXCEPTION-REASONS"
        );
        return row;
      });

      if (!updated) return reply.code(404).send({ error: "not_found" });
      return { reason: updated };
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "23505") return reply.code(409).send({ error: "exception_reason_code_conflict" });
      if (code === "23503") return reply.code(400).send({ error: "invalid_foreign_key" });
      throw error;
    }
  });

  app.post<{ Params: { id: string } }>("/api/v1/catalogs/load-exception-reasons/:id/deactivate", async (req, reply) => {
    const user = ensureCatalogWriteRole(req, reply);
    if (!user) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const updated = await withCurrentUser(user.uuid, async (client) => {
      const res = await client.query(
        `
          UPDATE catalogs.load_exception_reasons
          SET is_active = false
          WHERE id = $1
          RETURNING id, operating_company_id, code, name, applies_to, linked_module, sort_order, is_active, created_at
        `,
        [parsedParams.data.id]
      );
      const row = res.rows[0] ?? null;
      if (!row) return null;
      await appendCrudAudit(
        client,
        user.uuid,
        "catalogs.load_exception_reason.deactivated",
        { resource_id: row.id, resource_type: "catalogs.load_exception_reasons", code: row.code, operating_company_id: row.operating_company_id },
        "warning",
        "LEAD-ITEM-1-LOAD-EXCEPTION-REASONS"
      );
      return row;
    });

    if (!updated) return reply.code(404).send({ error: "not_found" });
    return { reason: updated };
  });

  app.post<{ Params: { id: string } }>("/api/v1/catalogs/load-exception-reasons/:id/reactivate", async (req, reply) => {
    const user = ensureCatalogWriteRole(req, reply);
    if (!user) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const updated = await withCurrentUser(user.uuid, async (client) => {
      const res = await client.query(
        `
          UPDATE catalogs.load_exception_reasons
          SET is_active = true
          WHERE id = $1
          RETURNING id, operating_company_id, code, name, applies_to, linked_module, sort_order, is_active, created_at
        `,
        [parsedParams.data.id]
      );
      const row = res.rows[0] ?? null;
      if (!row) return null;
      await appendCrudAudit(
        client,
        user.uuid,
        "catalogs.load_exception_reason.updated",
        { resource_id: row.id, resource_type: "catalogs.load_exception_reasons", changes: { is_active: true } },
        "info",
        "LEAD-ITEM-1-LOAD-EXCEPTION-REASONS"
      );
      return row;
    });

    if (!updated) return reply.code(404).send({ error: "not_found" });
    return { reason: updated };
  });
}
