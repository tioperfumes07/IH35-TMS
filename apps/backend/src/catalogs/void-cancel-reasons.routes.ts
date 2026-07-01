// [HOLD-FOR-JORGE — TIER 1] Task #24 — CRUD for the per-entity FINANCIAL void/cancel reason catalog.
//
// First code consumer of catalogs.void_cancel_reasons (migration 202606300030). Per-entity, RLS-respecting
// (the migration's policies scope reads to the user's accessible companies and gate writes to
// Owner/Administrator/Manager + same-entity). Modelled on load-cancellation-reasons.routes.ts, but for the
// FINANCIAL void surfaces (invoices, bills, payments, journal entries, settlements, WO voids) — NOT the
// dispatch load-cancel domain (that stays on catalogs.load_cancellation_reasons).
//
// void-not-delete: deactivate sets is_active=false + deactivated_at; NO DELETE route. system_seeded rows
// may be deactivated but the seed convention (reason_code lowercase snake_case) is preserved.

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit, buildPatchChanges } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const idParamSchema = z.object({ id: z.string().uuid() });

// Seed codes are lowercase snake_case ('duplicate','wrong_amount','other'); keep owner-added codes consistent.
const REASON_CODE_REGEX = /^[a-z][a-z0-9_]*$/;

const listQuerySchema = z.object({
  operating_company_id: z.string().uuid().optional(),
  include_inactive: z.enum(["true", "false"]).optional(),
});

const createReasonBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  reason_code: z
    .string()
    .trim()
    .regex(REASON_CODE_REGEX, "reason_code must be lowercase letters/digits/underscores")
    .min(2)
    .max(80),
  reason_label: z.string().trim().min(1).max(160),
  requires_note: z.boolean().default(false),
  sort_order: z.number().int().min(0).max(10000).default(100),
});

const updateReasonBodySchema = z
  .object({
    reason_code: z
      .string()
      .trim()
      .regex(REASON_CODE_REGEX, "reason_code must be lowercase letters/digits/underscores")
      .min(2)
      .max(80)
      .optional(),
    reason_label: z.string().trim().min(1).max(160).optional(),
    requires_note: z.boolean().optional(),
    sort_order: z.number().int().min(0).max(10000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "at least one field is required" });

const SELECT_COLS = `
  id, operating_company_id, reason_code, reason_label, requires_note, is_active, sort_order,
  system_seeded, deactivated_at, created_at, updated_at, created_by_user_id
`;

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function ensureCatalogWriteRole(req: FastifyRequest, reply: FastifyReply) {
  const user = currentAuthUser(req, reply);
  if (!user) return null;
  // Matches the migration 202606300030 INSERT/UPDATE WITH CHECK policy: Owner/Administrator/Manager.
  if (!["Owner", "Administrator", "Manager"].includes(user.role)) {
    reply.code(403).send({ error: "forbidden" });
    return null;
  }
  return user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

export async function registerVoidCancelReasonRoutes(app: FastifyInstance) {
  // LIST — per-entity (defaults to the caller's default/first accessible company).
  app.get("/api/v1/catalogs/void-cancel-reasons", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const parsedQuery = listQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

    const includeInactive = parsedQuery.data.include_inactive === "true";
    const rows = await withCurrentUser(user.uuid, async (client) => {
      let operatingCompanyId = parsedQuery.data.operating_company_id ?? null;
      if (!operatingCompanyId) {
        const resolvedCompanyRes = await client.query<{ id: string }>(
          `
            SELECT c.id
            FROM identity.users u
            JOIN org.companies c ON c.id = u.default_company_id
            WHERE u.id = $1
              AND c.id IN (SELECT org.user_accessible_company_ids())
            UNION
            SELECT c.id
            FROM org.companies c
            WHERE c.id IN (SELECT org.user_accessible_company_ids())
            ORDER BY id
            LIMIT 1
          `,
          [user.uuid]
        );
        operatingCompanyId = resolvedCompanyRes.rows[0]?.id ?? null;
      }
      if (!operatingCompanyId) return [];

      const values: unknown[] = [operatingCompanyId];
      let whereClause = `WHERE operating_company_id = $1`;
      if (!includeInactive) whereClause += ` AND is_active = true`;
      const res = await client.query(
        `
          SELECT ${SELECT_COLS}
          FROM catalogs.void_cancel_reasons
          ${whereClause}
          ORDER BY sort_order, reason_label
        `,
        values
      );
      return res.rows;
    });

    return { reasons: rows };
  });

  // CREATE — Owner/Administrator/Manager only; per-entity (RLS WITH CHECK also enforces same-entity).
  app.post("/api/v1/catalogs/void-cancel-reasons", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = ensureCatalogWriteRole(req, reply);
    if (!user) return;
    const parsedBody = createReasonBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const b = parsedBody.data;

    try {
      const created = await withCurrentUser(user.uuid, async (client) => {
        const res = await client.query(
          `
            INSERT INTO catalogs.void_cancel_reasons
              (operating_company_id, reason_code, reason_label, requires_note, sort_order, system_seeded, created_by_user_id)
            VALUES ($1, $2, $3, $4, $5, false, $6)
            RETURNING ${SELECT_COLS}
          `,
          [b.operating_company_id, b.reason_code, b.reason_label, b.requires_note, b.sort_order, user.uuid]
        );
        const row = res.rows[0];
        await appendCrudAudit(
          client,
          user.uuid,
          "catalogs.void_cancel_reason.created",
          {
            resource_id: row.id,
            resource_type: "catalogs.void_cancel_reasons",
            operating_company_id: row.operating_company_id,
            reason_code: row.reason_code,
            requires_note: row.requires_note,
          },
          "info",
          "TASK24-VOID-CANCEL-REASONS"
        );
        return row;
      });
      return reply.code(201).send({ reason: created });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "23505") return reply.code(409).send({ error: "void_cancel_reason_code_conflict" });
      if (code === "23503") return reply.code(400).send({ error: "invalid_foreign_key" });
      if (code === "42501") return reply.code(403).send({ error: "forbidden" });
      throw error;
    }
  });

  // UPDATE — edit label/requires_note/sort_order/code (per-entity via RLS).
  app.patch<{ Params: { id: string } }>("/api/v1/catalogs/void-cancel-reasons/:id", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = ensureCatalogWriteRole(req, reply);
    if (!user) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = updateReasonBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const b = parsedBody.data;

    const fields: string[] = [];
    const values: unknown[] = [];
    const add = (name: string, value: unknown) => {
      values.push(value);
      fields.push(`${name} = $${values.length}`);
    };
    if ("reason_code" in b) add("reason_code", b.reason_code);
    if ("reason_label" in b) add("reason_label", b.reason_label);
    if ("requires_note" in b) add("requires_note", b.requires_note);
    if ("sort_order" in b) add("sort_order", b.sort_order);
    values.push(parsedParams.data.id);

    try {
      const updated = await withCurrentUser(user.uuid, async (client) => {
        const oldRes = await client.query(
          `SELECT ${SELECT_COLS} FROM catalogs.void_cancel_reasons WHERE id = $1 LIMIT 1`,
          [parsedParams.data.id]
        );
        const oldRow = oldRes.rows[0] ?? null;
        if (!oldRow) return null;

        const res = await client.query(
          `
            UPDATE catalogs.void_cancel_reasons
            SET ${fields.join(", ")}
            WHERE id = $${values.length}
            RETURNING ${SELECT_COLS}
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
          "catalogs.void_cancel_reason.updated",
          { resource_id: row.id, resource_type: "catalogs.void_cancel_reasons", changes },
          "info",
          "TASK24-VOID-CANCEL-REASONS"
        );
        return row;
      });
      if (!updated) return reply.code(404).send({ error: "not_found" });
      return { reason: updated };
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "23505") return reply.code(409).send({ error: "void_cancel_reason_code_conflict" });
      if (code === "42501") return reply.code(403).send({ error: "forbidden" });
      throw error;
    }
  });

  // DEACTIVATE — void-not-delete (is_active=false + deactivated_at). NO DELETE route.
  app.post<{ Params: { id: string } }>("/api/v1/catalogs/void-cancel-reasons/:id/deactivate", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = ensureCatalogWriteRole(req, reply);
    if (!user) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const updated = await withCurrentUser(user.uuid, async (client) => {
      const res = await client.query(
        `
          UPDATE catalogs.void_cancel_reasons
          SET is_active = false, deactivated_at = now()
          WHERE id = $1
          RETURNING ${SELECT_COLS}
        `,
        [parsedParams.data.id]
      );
      const row = res.rows[0] ?? null;
      if (!row) return null;
      await appendCrudAudit(
        client,
        user.uuid,
        "catalogs.void_cancel_reason.deactivated",
        {
          resource_id: row.id,
          resource_type: "catalogs.void_cancel_reasons",
          reason_code: row.reason_code,
          operating_company_id: row.operating_company_id,
        },
        "warning",
        "TASK24-VOID-CANCEL-REASONS"
      );
      return row;
    });
    if (!updated) return reply.code(404).send({ error: "not_found" });
    return { reason: updated };
  });

  // REACTIVATE — restore a deactivated reason (is_active=true + clear deactivated_at).
  app.post<{ Params: { id: string } }>("/api/v1/catalogs/void-cancel-reasons/:id/reactivate", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = ensureCatalogWriteRole(req, reply);
    if (!user) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const updated = await withCurrentUser(user.uuid, async (client) => {
      const res = await client.query(
        `
          UPDATE catalogs.void_cancel_reasons
          SET is_active = true, deactivated_at = NULL
          WHERE id = $1
          RETURNING ${SELECT_COLS}
        `,
        [parsedParams.data.id]
      );
      const row = res.rows[0] ?? null;
      if (!row) return null;
      await appendCrudAudit(
        client,
        user.uuid,
        "catalogs.void_cancel_reason.updated",
        { resource_id: row.id, resource_type: "catalogs.void_cancel_reasons", changes: { is_active: true } },
        "info",
        "TASK24-VOID-CANCEL-REASONS"
      );
      return row;
    });
    if (!updated) return reply.code(404).send({ error: "not_found" });
    return { reason: updated };
  });
}
