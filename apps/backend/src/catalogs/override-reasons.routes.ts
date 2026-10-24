// LEAD 443.294 step 1b — CRUD for the ONE per-entity override reason catalog (catalogs.override_reasons, migration
// 202616230300). Modelled on void-cancel-reasons.routes.ts: per-entity, RLS-respecting (reads scoped to the user's
// companies; writes Owner/Administrator/Manager + same entity), void-not-delete (deactivate / reactivate, NO DELETE).
//
// GET ?context=<ctx> is what the OverrideButton's dropdown reads: active reasons allowed in that context, role_only rows
// excluded (owner_override / accountant_override are what the engine STORES when those roles confirm — never picked).
// role_only rows keep their code and contexts (the engine depends on them); only their labels / sort may change.

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { resolveOperatingCompanyId } from "../auth/operating-company-scope.js";
import { z } from "zod";
import { appendCrudAudit, buildPatchChanges } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

export const OVERRIDE_CONTEXTS = [
  "factoring",
  "expense",
  "load_wizard",
  "settlement",
  "banking",
  "invoice",
  "bill",
  "dispatch",
  "safety",
  "maintenance",
] as const;
export type OverrideContext = (typeof OVERRIDE_CONTEXTS)[number];

const idParamSchema = z.object({ id: z.string().uuid() });
const REASON_CODE_REGEX = /^[a-z][a-z0-9_]*$/;
const contextSchema = z.enum(OVERRIDE_CONTEXTS);

const listQuerySchema = z.object({
  operating_company_id: z.string().uuid().optional(),
  context: contextSchema.optional(),
  include_inactive: z.enum(["true", "false"]).optional(),
  include_role_only: z.enum(["true", "false"]).optional(),
});

const createReasonBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  reason_code: z.string().trim().regex(REASON_CODE_REGEX, "reason_code must be lowercase letters/digits/underscores").min(2).max(80),
  label_en: z.string().trim().min(1).max(160),
  label_es: z.string().trim().min(1).max(160),
  contexts: z.array(contextSchema).min(1),
  sort_order: z.number().int().min(0).max(10000).default(100),
});

const updateReasonBodySchema = z
  .object({
    reason_code: z.string().trim().regex(REASON_CODE_REGEX, "reason_code must be lowercase letters/digits/underscores").min(2).max(80).optional(),
    label_en: z.string().trim().min(1).max(160).optional(),
    label_es: z.string().trim().min(1).max(160).optional(),
    contexts: z.array(contextSchema).min(1).optional(),
    sort_order: z.number().int().min(0).max(10000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "at least one field is required" });

const SELECT_COLS = `
  id, operating_company_id, reason_code, label_en, label_es, contexts, role_only, is_active, sort_order,
  system_seeded, deactivated_at, created_at, updated_at, created_by_user_id
`;

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function ensureCatalogWriteRole(req: FastifyRequest, reply: FastifyReply) {
  const user = currentAuthUser(req, reply);
  if (!user) return null;
  // Matches the migration 202616230300 INSERT/UPDATE WITH CHECK policy: Owner/Administrator/Manager.
  if (!["Owner", "Administrator", "Manager"].includes(user.role)) {
    reply.code(403).send({ error: "forbidden" });
    return null;
  }
  return user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

export async function registerOverrideReasonRoutes(app: FastifyInstance) {
  // LIST — per entity; ?context= filters to the reasons a button in that context may offer.
  app.get("/api/v1/catalogs/override-reasons", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const q = listQuerySchema.safeParse(req.query ?? {});
    if (!q.success) return sendValidationError(reply, q.error);

    const rows = await withCurrentUser(user.uuid, async (client) => {
      const operatingCompanyId = await resolveOperatingCompanyId(client, user.uuid, q.data.operating_company_id ?? null);
      if (!operatingCompanyId) return [];
      const values: unknown[] = [operatingCompanyId];
      const where = [`operating_company_id = $1::uuid`];
      if (q.data.include_inactive !== "true") where.push(`is_active = true`);
      if (q.data.include_role_only !== "true") where.push(`role_only = false`);
      if (q.data.context) {
        values.push(q.data.context);
        where.push(`$${values.length}::text = ANY (contexts)`);
      }
      const res = await client.query(
        `SELECT ${SELECT_COLS} FROM catalogs.override_reasons WHERE ${where.join(" AND ")} ORDER BY sort_order, label_en`,
        values
      );
      return res.rows;
    });
    return { reasons: rows };
  });

  // CREATE — Owner/Administrator/Manager; never a role_only row (those are the engine's two fixed codes).
  app.post("/api/v1/catalogs/override-reasons", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = ensureCatalogWriteRole(req, reply);
    if (!user) return;
    const parsed = createReasonBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);
    const b = parsed.data;
    try {
      const created = await withCurrentUser(user.uuid, async (client) => {
        const res = await client.query(
          `INSERT INTO catalogs.override_reasons
             (operating_company_id, reason_code, label_en, label_es, contexts, role_only, sort_order, system_seeded, created_by_user_id)
           VALUES ($1, $2, $3, $4, $5::text[], false, $6, false, $7)
           RETURNING ${SELECT_COLS}`,
          [b.operating_company_id, b.reason_code, b.label_en, b.label_es, b.contexts, b.sort_order, user.uuid]
        );
        const row = res.rows[0];
        await appendCrudAudit(
          client,
          user.uuid,
          "catalogs.override_reason.created",
          { resource_id: row.id, resource_type: "catalogs.override_reasons", operating_company_id: row.operating_company_id, reason_code: row.reason_code, contexts: row.contexts },
          "info",
          "LEAD-443294-OVERRIDE-REASONS"
        );
        return row;
      });
      return reply.code(201).send({ reason: created });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "23505") return reply.code(409).send({ error: "override_reason_code_conflict" });
      if (code === "23514") return reply.code(400).send({ error: "override_reason_context_unknown" });
      if (code === "23503") return reply.code(400).send({ error: "invalid_foreign_key" });
      if (code === "42501") return reply.code(403).send({ error: "forbidden" });
      throw error;
    }
  });

  // UPDATE — labels / contexts / sort / code; a role_only row keeps its code and contexts.
  app.patch<{ Params: { id: string } }>("/api/v1/catalogs/override-reasons/:id", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = ensureCatalogWriteRole(req, reply);
    if (!user) return;
    const p = idParamSchema.safeParse(req.params ?? {});
    if (!p.success) return sendValidationError(reply, p.error);
    const parsed = updateReasonBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);
    const b = parsed.data;
    try {
      const result = await withCurrentUser(user.uuid, async (client) => {
        const oldRes = await client.query(`SELECT ${SELECT_COLS} FROM catalogs.override_reasons WHERE id = $1 LIMIT 1`, [p.data.id]);
        const oldRow = oldRes.rows[0] ?? null;
        if (!oldRow) return { status: 404 as const };
        if (oldRow.role_only && ("reason_code" in b || "contexts" in b)) return { status: 409 as const };
        const fields: string[] = [];
        const values: unknown[] = [];
        const add = (name: string, value: unknown, cast = "") => {
          values.push(value);
          fields.push(`${name} = $${values.length}${cast}`);
        };
        if ("reason_code" in b) add("reason_code", b.reason_code);
        if ("label_en" in b) add("label_en", b.label_en);
        if ("label_es" in b) add("label_es", b.label_es);
        if ("contexts" in b) add("contexts", b.contexts, "::text[]");
        if ("sort_order" in b) add("sort_order", b.sort_order);
        values.push(p.data.id);
        const res = await client.query(
          `UPDATE catalogs.override_reasons SET ${fields.join(", ")} WHERE id = $${values.length} RETURNING ${SELECT_COLS}`,
          values
        );
        const row = res.rows[0] ?? null;
        if (!row) return { status: 404 as const };
        const changes = buildPatchChanges(b as unknown as Record<string, unknown>, oldRow as Record<string, unknown>, row as Record<string, unknown>);
        await appendCrudAudit(
          client,
          user.uuid,
          "catalogs.override_reason.updated",
          { resource_id: row.id, resource_type: "catalogs.override_reasons", changes },
          "info",
          "LEAD-443294-OVERRIDE-REASONS"
        );
        return { status: 200 as const, row };
      });
      if (result.status === 404) return reply.code(404).send({ error: "not_found" });
      if (result.status === 409) return reply.code(409).send({ error: "role_only_reason_locked" });
      return { reason: result.row };
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "23505") return reply.code(409).send({ error: "override_reason_code_conflict" });
      if (code === "23514") return reply.code(400).send({ error: "override_reason_context_unknown" });
      if (code === "42501") return reply.code(403).send({ error: "forbidden" });
      throw error;
    }
  });

  // DEACTIVATE / REACTIVATE — void-not-delete. A role_only row is never deactivated (the engine stores it).
  for (const action of ["deactivate", "reactivate"] as const) {
    app.post<{ Params: { id: string } }>(`/api/v1/catalogs/override-reasons/:id/${action}`, { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
      const user = ensureCatalogWriteRole(req, reply);
      if (!user) return;
      const p = idParamSchema.safeParse(req.params ?? {});
      if (!p.success) return sendValidationError(reply, p.error);
      const result = await withCurrentUser(user.uuid, async (client) => {
        const res = await client.query(
          action === "deactivate"
            ? `UPDATE catalogs.override_reasons SET is_active = false, deactivated_at = now() WHERE id = $1 AND role_only = false RETURNING ${SELECT_COLS}`
            : `UPDATE catalogs.override_reasons SET is_active = true, deactivated_at = NULL WHERE id = $1 RETURNING ${SELECT_COLS}`,
          [p.data.id]
        );
        const row = res.rows[0] ?? null;
        if (!row) return null;
        await appendCrudAudit(
          client,
          user.uuid,
          action === "deactivate" ? "catalogs.override_reason.deactivated" : "catalogs.override_reason.updated",
          { resource_id: row.id, resource_type: "catalogs.override_reasons", reason_code: row.reason_code, changes: { is_active: action === "reactivate" } },
          action === "deactivate" ? "warning" : "info",
          "LEAD-443294-OVERRIDE-REASONS"
        );
        return row;
      });
      if (!result) return reply.code(404).send({ error: "not_found_or_role_only" });
      return { reason: result };
    });
  }
}
