// C2-RETIRE-WRITE-EXEMPT: catalogs.load_cancellation_reasons is NOT a RETIRE table drifted from a
// canonical replacement — it is a deliberate, owner-approved SEPARATE catalog from
// catalogs.cancellation_reasons (the financial void/cancel catalog governed by
// governance/void-cancel-executors.ts). The design decision is recorded in migration
// 202606300030_void_cancel_reasons_catalog.sql: "load cancellations stay on the per-entity
// catalogs.load_cancellation_reasons — separate operational domain, NOT the financial void catalog."
// SWEEP-C2 (2026-09-02) verified this direction is CORRECT (per the owner spec's own "VERIFY direction"
// instruction) and is not repointing it — doing so would merge two intentionally distinct catalogs and
// break the dispatch load-cancellation domain's dedicated maker/checker workflow
// (dispatch/cancellation.service.ts::cancelLoad / approveCancellation). This file-wide marker removes it
// from the SWEEP-C2 write-inventory scan; verify-no-retire-table-writes.mjs (1194) KNOWN_LEGACY entry for
// this table stays as documentation of the historical false-positive pattern match, not a pending repoint.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { resolveOperatingCompanyId } from "../auth/operating-company-scope.js";
import { z } from "zod";
import { appendCrudAudit, buildPatchChanges } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const cancellationCategorySchema = z.enum(["customer_initiated", "carrier_initiated", "force_majeure", "other"]);
const idParamSchema = z.object({ id: z.string().uuid() });

const listQuerySchema = z.object({
  operating_company_id: z.string().uuid().optional(),
  include_inactive: z.enum(["true", "false"]).optional(),
});

// Exported for the LISTS-LOAD-CANCELLATION-REASONS-CREATE-DESCRIPTION-NULL-400 regression test — a
// pure schema, no I/O.
export const createReasonBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  reason_code: z
    .string()
    .trim()
    .regex(/^[A-Z][A-Z0-9_]+$/, "reason_code must be uppercase letters/digits/underscores")
    .min(2)
    .max(80),
  display_name: z.string().trim().min(1).max(160),
  category: cancellationCategorySchema,
  sort_order: z.number().int().min(0).max(10000).default(100),
  // LISTS-LOAD-CANCELLATION-REASONS-CREATE-DESCRIPTION-NULL-400: matches updateReasonBodySchema's
  // description field below — the frontend's blank-description form value is `null` (a deliberate,
  // common client idiom for "no value"), not `undefined`; a bare `.optional()` here rejects that
  // exact shape ("expected string, received null"), 400-ing every create where Description is left
  // blank (the common case for this optional field).
  description: z.string().trim().max(1000).nullable().optional(),
});

const updateReasonBodySchema = z
  .object({
    reason_code: z
      .string()
      .trim()
      .regex(/^[A-Z][A-Z0-9_]+$/, "reason_code must be uppercase letters/digits/underscores")
      .min(2)
      .max(80)
      .optional(),
    display_name: z.string().trim().min(1).max(160).optional(),
    category: cancellationCategorySchema.optional(),
    sort_order: z.number().int().min(0).max(10000).optional(),
    description: z.string().trim().max(1000).nullable().optional(),
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

export async function registerLoadCancellationReasonRoutes(app: FastifyInstance) {
  app.get("/api/v1/catalogs/load-cancellation-reasons", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const parsedQuery = listQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

    const includeInactive = parsedQuery.data.include_inactive === "true";
    const rows = await withCurrentUser(user.uuid, async (client) => {
      // LST-F05: was an inline `UNION … ORDER BY id LIMIT 1` that picked the LOWEST accessible UUID
      // across ALL companies, LOSING the user's default — and USMCA (5c854333…) < TRANSP (91e0bf0a…),
      // so a param-omitting call hijacked TRANSP's default to USMCA. Repointed to the canonical
      // resolveOperatingCompanyId, which does COALESCE(default, lowest) and validates membership
      // (the same resolver items/accounts/classes already use).
      const operatingCompanyId = await resolveOperatingCompanyId(
        client,
        user.uuid,
        parsedQuery.data.operating_company_id ?? null
      );
      if (!operatingCompanyId) return [];

      const values: unknown[] = [operatingCompanyId];
      let whereClause = `
        WHERE operating_company_id = $1::uuid
      `;
      if (!includeInactive) {
        whereClause += `
          AND is_active = true
        `;
      }
      const res = await client.query(
        `
          SELECT
            id, operating_company_id, reason_code, display_name, category, is_active, sort_order, description,
            created_at, updated_at, created_by_user_id
          FROM catalogs.load_cancellation_reasons
          ${whereClause}
          ORDER BY sort_order, display_name
        `,
        values
      );
      return res.rows;
    });

    return { reasons: rows };
  });

  app.post("/api/v1/catalogs/load-cancellation-reasons", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = ensureCatalogWriteRole(req, reply);
    if (!user) return;
    const parsedBody = createReasonBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const b = parsedBody.data;

    try {
      const created = await withCurrentUser(user.uuid, async (client) => {
        const res = await client.query(
          `
            INSERT INTO catalogs.load_cancellation_reasons (
              operating_company_id, reason_code, display_name, category, sort_order, description, created_by_user_id
            ) VALUES ($1, $2, $3, $4::catalogs.cancellation_category_enum, $5, $6, $7)
            RETURNING
              id, operating_company_id, reason_code, display_name, category, is_active, sort_order, description,
              created_at, updated_at, created_by_user_id
          `,
          [b.operating_company_id, b.reason_code, b.display_name, b.category, b.sort_order, b.description ?? null, user.uuid]
        );
        const row = res.rows[0];
        await appendCrudAudit(
          client,
          user.uuid,
          "catalogs.load_cancellation_reason.created",
          {
            resource_id: row.id,
            resource_type: "catalogs.load_cancellation_reasons",
            operating_company_id: row.operating_company_id,
            reason_code: row.reason_code,
            category: row.category,
          },
          "info",
          "BT-3-LOAD-CANCELLATION-REASONS"
        );
        return row;
      });

      return reply.code(201).send({ reason: created });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "23505") return reply.code(409).send({ error: "cancellation_reason_code_conflict" });
      if (code === "23503") return reply.code(400).send({ error: "invalid_foreign_key" });
      throw error;
    }
  });

  app.patch<{ Params: { id: string } }>("/api/v1/catalogs/load-cancellation-reasons/:id", async (req, reply) => {
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
    if ("display_name" in b) add("display_name", b.display_name);
    if ("category" in b) add("category", b.category);
    if ("sort_order" in b) add("sort_order", b.sort_order);
    if ("description" in b) add("description", b.description ?? null);
    values.push(parsedParams.data.id);

    try {
      const updated = await withCurrentUser(user.uuid, async (client) => {
        const oldRes = await client.query(
          `
            SELECT
              id, operating_company_id, reason_code, display_name, category, is_active, sort_order, description,
              created_at, updated_at, created_by_user_id
            FROM catalogs.load_cancellation_reasons
            WHERE id = $1
            LIMIT 1
          `,
          [parsedParams.data.id]
        );
        const oldRow = oldRes.rows[0] ?? null;
        if (!oldRow) return null;

        const res = await client.query(
          `
            UPDATE catalogs.load_cancellation_reasons
            SET ${fields.join(", ")}
            WHERE id = $${values.length}
            RETURNING
              id, operating_company_id, reason_code, display_name, category, is_active, sort_order, description,
              created_at, updated_at, created_by_user_id
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
          "catalogs.load_cancellation_reason.updated",
          {
            resource_id: row.id,
            resource_type: "catalogs.load_cancellation_reasons",
            changes,
          },
          "info",
          "BT-3-LOAD-CANCELLATION-REASONS"
        );
        return row;
      });

      if (!updated) return reply.code(404).send({ error: "not_found" });
      return { reason: updated };
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "23505") return reply.code(409).send({ error: "cancellation_reason_code_conflict" });
      if (code === "23503") return reply.code(400).send({ error: "invalid_foreign_key" });
      throw error;
    }
  });

  app.post<{ Params: { id: string } }>("/api/v1/catalogs/load-cancellation-reasons/:id/deactivate", async (req, reply) => {
    const user = ensureCatalogWriteRole(req, reply);
    if (!user) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const updated = await withCurrentUser(user.uuid, async (client) => {
      const res = await client.query(
        `
          UPDATE catalogs.load_cancellation_reasons
          SET is_active = false
          WHERE id = $1
          RETURNING
            id, operating_company_id, reason_code, display_name, category, is_active, sort_order, description,
            created_at, updated_at, created_by_user_id
        `,
        [parsedParams.data.id]
      );
      const row = res.rows[0] ?? null;
      if (!row) return null;
      await appendCrudAudit(
        client,
        user.uuid,
        "catalogs.load_cancellation_reason.deactivated",
        {
          resource_id: row.id,
          resource_type: "catalogs.load_cancellation_reasons",
          reason_code: row.reason_code,
          operating_company_id: row.operating_company_id,
        },
        "warning",
        "BT-3-LOAD-CANCELLATION-REASONS"
      );
      return row;
    });

    if (!updated) return reply.code(404).send({ error: "not_found" });
    return { reason: updated };
  });

  app.post<{ Params: { id: string } }>("/api/v1/catalogs/load-cancellation-reasons/:id/reactivate", async (req, reply) => {
    const user = ensureCatalogWriteRole(req, reply);
    if (!user) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const updated = await withCurrentUser(user.uuid, async (client) => {
      const res = await client.query(
        `
          UPDATE catalogs.load_cancellation_reasons
          SET is_active = true
          WHERE id = $1
          RETURNING
            id, operating_company_id, reason_code, display_name, category, is_active, sort_order, description,
            created_at, updated_at, created_by_user_id
        `,
        [parsedParams.data.id]
      );
      const row = res.rows[0] ?? null;
      if (!row) return null;
      await appendCrudAudit(
        client,
        user.uuid,
        "catalogs.load_cancellation_reason.updated",
        {
          resource_id: row.id,
          resource_type: "catalogs.load_cancellation_reasons",
          changes: { is_active: true },
        },
        "info",
        "BT-3-LOAD-CANCELLATION-REASONS"
      );
      return row;
    });

    if (!updated) return reply.code(404).send({ error: "not_found" });
    return { reason: updated };
  });
}
