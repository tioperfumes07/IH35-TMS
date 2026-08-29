import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit, buildPatchChanges } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return reply;
  return req.user;
}

// Matches the migration's write GRANT + the write-role convention every other catalog CRUD route
// uses (void-cancel-reasons.routes.ts, load-cancellation-reasons.routes.ts): Owner/Administrator/
// Manager only. This catalog is GLOBAL (no operating_company_id, no RLS — migration 202606221200
// deliberately mirrors catalogs.cancellation_reasons), so there is no per-entity scoping here.
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

// reason_code is the PRIMARY KEY (text, not a uuid id) — keep the same convention the seed rows
// use (uppercase snake_case: DUPLICATE, CREATED_IN_ERROR, …) so owner-added codes stay consistent
// with the six system-seeded rows.
const REASON_CODE_REGEX = /^[A-Z][A-Z0-9_]*$/;

const idParamSchema = z.object({ reasonCode: z.string().min(1).max(80) });

const createReasonBodySchema = z.object({
  reason_code: z
    .string()
    .trim()
    .regex(REASON_CODE_REGEX, "reason_code must be uppercase letters/digits/underscores")
    .min(2)
    .max(80),
  reason_label: z.string().trim().min(1).max(160),
  requires_owner_approval: z.boolean().default(false),
  sort_order: z.number().int().min(0).max(10000).default(100),
});

const updateReasonBodySchema = z
  .object({
    reason_label: z.string().trim().min(1).max(160).optional(),
    requires_owner_approval: z.boolean().optional(),
    sort_order: z.number().int().min(0).max(10000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "at least one field is required" });

const SELECT_COLS = `reason_code, reason_label, requires_owner_approval, sort_order, is_active`;

/**
 * CRUD for WO cancellation reasons (catalogs.wo_cancellation_reasons, migration 202606221200).
 * The Cancel WO modal's reason dropdown is fed from here, and the WO cancel route validates
 * cancel_reason_code AGAINST this catalog — never a hard-coded enum (the #1335 lesson).
 *
 * WO-CANCEL-REASON-NO-CREATE-ROUTE: this was read-only (GET only) — both frontend consumers
 * (WorkOrderDetailPage.tsx, WorkOrdersConsoleDetailPage.tsx) rendered a bare Combobox with no
 * "+ Add new" because there was nowhere to POST a new reason to. Adds CREATE/UPDATE/deactivate so
 * the frontend picker_law fix (ReferenceSelect createKind="wo_cancellation_reason") has a real
 * write endpoint behind it. Global catalog — no operating_company_id, no RLS (matches the
 * migration's own catalogs.cancellation_reasons precedent); void-not-delete via is_active, no
 * DELETE route despite the migration's GRANT including it (Rule 07 — never delete, only add).
 */
export async function registerWoCancellationReasonRoutes(app: FastifyInstance) {
  app.get("/api/v1/catalogs/wo-cancellation-reasons", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const rows = await withCurrentUser(user.uuid, async (client) => {
      const res = await client.query<{
        reason_code: string;
        reason_label: string;
        requires_owner_approval: boolean;
        sort_order: number;
      }>(
        `SELECT reason_code, reason_label, requires_owner_approval, sort_order
           FROM catalogs.wo_cancellation_reasons
          WHERE is_active = true
          ORDER BY sort_order ASC, reason_label ASC`
      );
      return res.rows;
    });
    return reply.send({ reasons: rows });
  });

  // CREATE — Owner/Administrator/Manager only.
  app.post("/api/v1/catalogs/wo-cancellation-reasons", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = ensureCatalogWriteRole(req, reply);
    if (!user) return;
    const parsedBody = createReasonBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const b = parsedBody.data;

    try {
      const created = await withCurrentUser(user.uuid, async (client) => {
        const res = await client.query(
          `
            INSERT INTO catalogs.wo_cancellation_reasons
              (reason_code, reason_label, requires_owner_approval, sort_order)
            VALUES ($1, $2, $3, $4)
            RETURNING ${SELECT_COLS}
          `,
          [b.reason_code, b.reason_label, b.requires_owner_approval, b.sort_order]
        );
        const row = res.rows[0];
        await appendCrudAudit(
          client,
          user.uuid,
          "catalogs.wo_cancellation_reason.created",
          {
            resource_id: row.reason_code,
            resource_type: "catalogs.wo_cancellation_reasons",
            reason_code: row.reason_code,
            requires_owner_approval: row.requires_owner_approval,
          },
          "info",
          "WO-CANCEL-REASON-NO-CREATE-ROUTE"
        );
        return row;
      });
      return reply.code(201).send({ reason: created });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "23505") return reply.code(409).send({ error: "wo_cancellation_reason_code_conflict" });
      if (code === "42501") return reply.code(403).send({ error: "forbidden" });
      throw error;
    }
  });

  // UPDATE — label/requires_owner_approval/sort_order. reason_code (the PK) is immutable by design —
  // it is the value already persisted on any historical work_orders.cancel_reason_code.
  app.patch<{ Params: { reasonCode: string } }>(
    "/api/v1/catalogs/wo-cancellation-reasons/:reasonCode",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
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
      if ("reason_label" in b) add("reason_label", b.reason_label);
      if ("requires_owner_approval" in b) add("requires_owner_approval", b.requires_owner_approval);
      if ("sort_order" in b) add("sort_order", b.sort_order);
      values.push(parsedParams.data.reasonCode);

      const updated = await withCurrentUser(user.uuid, async (client) => {
        const oldRes = await client.query(
          `SELECT ${SELECT_COLS} FROM catalogs.wo_cancellation_reasons WHERE reason_code = $1 LIMIT 1`,
          [parsedParams.data.reasonCode]
        );
        const oldRow = oldRes.rows[0] ?? null;
        if (!oldRow) return null;

        const res = await client.query(
          `
            UPDATE catalogs.wo_cancellation_reasons
            SET ${fields.join(", ")}
            WHERE reason_code = $${values.length}
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
          "catalogs.wo_cancellation_reason.updated",
          { resource_id: row.reason_code, resource_type: "catalogs.wo_cancellation_reasons", changes },
          "info",
          "WO-CANCEL-REASON-NO-CREATE-ROUTE"
        );
        return row;
      });
      if (!updated) return reply.code(404).send({ error: "not_found" });
      return { reason: updated };
    }
  );

  // DEACTIVATE — void-not-delete (is_active=false). NO DELETE route (Rule 07).
  app.post<{ Params: { reasonCode: string } }>(
    "/api/v1/catalogs/wo-cancellation-reasons/:reasonCode/deactivate",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = ensureCatalogWriteRole(req, reply);
      if (!user) return;
      const parsedParams = idParamSchema.safeParse(req.params ?? {});
      if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

      const updated = await withCurrentUser(user.uuid, async (client) => {
        const res = await client.query(
          `
            UPDATE catalogs.wo_cancellation_reasons
            SET is_active = false
            WHERE reason_code = $1
            RETURNING ${SELECT_COLS}
          `,
          [parsedParams.data.reasonCode]
        );
        const row = res.rows[0] ?? null;
        if (!row) return null;
        await appendCrudAudit(
          client,
          user.uuid,
          "catalogs.wo_cancellation_reason.deactivated",
          { resource_id: row.reason_code, resource_type: "catalogs.wo_cancellation_reasons", reason_code: row.reason_code },
          "warning",
          "WO-CANCEL-REASON-NO-CREATE-ROUTE"
        );
        return row;
      });
      if (!updated) return reply.code(404).send({ error: "not_found" });
      return { reason: updated };
    }
  );

  // REACTIVATE — restore a deactivated reason.
  app.post<{ Params: { reasonCode: string } }>(
    "/api/v1/catalogs/wo-cancellation-reasons/:reasonCode/reactivate",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = ensureCatalogWriteRole(req, reply);
      if (!user) return;
      const parsedParams = idParamSchema.safeParse(req.params ?? {});
      if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

      const updated = await withCurrentUser(user.uuid, async (client) => {
        const res = await client.query(
          `
            UPDATE catalogs.wo_cancellation_reasons
            SET is_active = true
            WHERE reason_code = $1
            RETURNING ${SELECT_COLS}
          `,
          [parsedParams.data.reasonCode]
        );
        const row = res.rows[0] ?? null;
        if (!row) return null;
        await appendCrudAudit(
          client,
          user.uuid,
          "catalogs.wo_cancellation_reason.updated",
          { resource_id: row.reason_code, resource_type: "catalogs.wo_cancellation_reasons", changes: { is_active: true } },
          "info",
          "WO-CANCEL-REASON-NO-CREATE-ROUTE"
        );
        return row;
      });
      if (!updated) return reply.code(404).send({ error: "not_found" });
      return { reason: updated };
    }
  );
}
