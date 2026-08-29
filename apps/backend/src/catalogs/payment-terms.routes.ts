import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit, buildPatchChanges } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { isCatalogWriteRole } from "../auth/role-helpers.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { resolveCatalogDescriptionFromName } from "./accounting/factory.js";

const listQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(["active", "inactive"]).optional(),
  search: z.string().trim().min(1).max(100).optional(),
});

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const idParamSchema = z.object({ id: z.string().uuid() });

const paymentTermsBaseSchema = z.object({
  terms_name: z.string().trim().min(1).max(200).optional(),
  days_until_due: z.coerce.number().int().min(0).optional(),
  early_payment_discount_pct: z.coerce.number().min(0).max(100).multipleOf(0.01).nullable().optional(),
  early_payment_discount_days: z.coerce.number().int().min(0).nullable().optional(),
  qbo_terms_id: z.string().trim().max(100).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  deactivated_at: z.string().datetime().nullable().optional(),
});

const createBodySchema = paymentTermsBaseSchema
  .extend({
    operating_company_id: z.string().uuid(),
    terms_name: z.string().trim().min(1).max(200),
    days_until_due: z.coerce.number().int().min(0),
  })
  .superRefine((v, ctx) => {
    const hasPct = v.early_payment_discount_pct !== null && v.early_payment_discount_pct !== undefined;
    const hasDays = v.early_payment_discount_days !== null && v.early_payment_discount_days !== undefined;
    if (hasPct !== hasDays) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "early_payment_discount_pct and early_payment_discount_days must be provided together",
        path: hasPct ? ["early_payment_discount_days"] : ["early_payment_discount_pct"],
      });
    }
  });

const updateBodySchema = paymentTermsBaseSchema
  .refine((v) => Object.keys(v).length > 0, { message: "at least one field is required" })
  .superRefine((v, ctx) => {
    const hasPct = Object.prototype.hasOwnProperty.call(v, "early_payment_discount_pct");
    const hasDays = Object.prototype.hasOwnProperty.call(v, "early_payment_discount_days");
    if (hasPct !== hasDays) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "early_payment_discount_pct and early_payment_discount_days must be patched together",
      });
    }
  });

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return reply;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function mapConflict(constraint?: string): string {
  if (!constraint) return "catalog_payment_terms_conflict";
  if (constraint.includes("terms_name")) return "catalog_payment_terms_conflict_terms_name";
  if (constraint.includes("qbo_terms_id")) return "catalog_payment_terms_conflict_qbo_terms_id";
  return "catalog_payment_terms_conflict";
}

/** LST-F03: FORCE RLS company_scope requires entity GUC on every CRUD path. */
async function withEntityScope<T>(
  userId: string,
  operatingCompanyId: string,
  fn: (client: {
    query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
  }) => Promise<T>
): Promise<T> {
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [operatingCompanyId]);
    return fn(client);
  });
}

const SELECT_COLS = `
  id, operating_company_id, terms_name, days_until_due, early_payment_discount_pct, early_payment_discount_days,
  qbo_terms_id, notes, created_at, updated_at, deactivated_at, created_by_user_id, updated_by_user_id
`;

export async function registerPaymentTermsRoutes(app: FastifyInstance) {
  app.get("/api/v1/catalogs/payment-terms", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsed = listQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      if (!(req.query as { operating_company_id?: string } | undefined)?.operating_company_id) {
        return reply.code(400).send({ error: "operating_company_id_required" });
      }
      return sendValidationError(reply, parsed.error);
    }
    const { operating_company_id: opco, limit, offset, status, search } = parsed.data;

    const payment_terms = await withEntityScope(authUser.uuid, opco, async (client) => {
      const values: unknown[] = [opco];
      const filters: string[] = ["operating_company_id = $1::uuid"];
      if (status === "active") filters.push("deactivated_at IS NULL");
      if (status === "inactive") filters.push("deactivated_at IS NOT NULL");
      if (search) {
        values.push(`%${search}%`);
        const idx = values.length;
        filters.push(`(terms_name ILIKE $${idx} OR qbo_terms_id ILIKE $${idx})`);
      }
      values.push(limit);
      values.push(offset);
      const res = await client.query(
        `
          SELECT ${SELECT_COLS}
          FROM catalogs.payment_terms
          WHERE ${filters.join(" AND ")}
          ORDER BY created_at DESC
          LIMIT $${values.length - 1}
          OFFSET $${values.length}
        `,
        values
      );
      return res.rows;
    });

    return { payment_terms };
  });

  app.post("/api/v1/catalogs/payment-terms", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isCatalogWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsed = createBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);
    const b = parsed.data;
    // LV-LIST-SAMPLE-TAG-IN-NAME-ONLY: if the operator puts a Gate-B sample tag in the name and
    // leaves notes empty, copy the tag into notes so a single predicate can find the row.
    const resolvedNotes = resolveCatalogDescriptionFromName(b.terms_name, b.notes) ?? b.notes ?? null;

    try {
      const created = await withEntityScope(authUser.uuid, b.operating_company_id, async (client) => {
        const res = await client.query(
          `
            INSERT INTO catalogs.payment_terms (
              operating_company_id, terms_name, days_until_due, early_payment_discount_pct, early_payment_discount_days,
              qbo_terms_id, notes, created_by_user_id, updated_by_user_id
            ) VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$8
            )
            RETURNING ${SELECT_COLS}
          `,
          [
            b.operating_company_id,
            b.terms_name,
            b.days_until_due,
            b.early_payment_discount_pct ?? null,
            b.early_payment_discount_days ?? null,
            b.qbo_terms_id ?? null,
            resolvedNotes,
            authUser.uuid,
          ]
        );
        const row = res.rows[0];
        await appendCrudAudit(client, authUser.uuid, "catalogs.payment_terms.created", {
          resource_id: row.id,
          resource_type: "catalogs.payment_terms",
          id: row.id,
          operating_company_id: row.operating_company_id,
          terms_name: row.terms_name,
          days_until_due: row.days_until_due,
        });
        return row;
      });
      return reply.code(201).send(created);
    } catch (err) {
      const code = (err as { code?: string }).code;
      const constraint = (err as { constraint?: string }).constraint;
      if (code === "23505") return reply.code(409).send({ error: mapConflict(constraint), field: constraint ?? null });
      if (code === "23514") return reply.code(400).send({ error: "invalid_payment_terms_check_constraint" });
      throw err;
    }
  });

  app.get("/api/v1/catalogs/payment-terms/:id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedQuery = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return reply.code(400).send({ error: "operating_company_id_required" });

    const row = await withEntityScope(authUser.uuid, parsedQuery.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT ${SELECT_COLS}
          FROM catalogs.payment_terms
          WHERE id = $1 AND operating_company_id = $2::uuid
          LIMIT 1
        `,
        [parsedParams.data.id, parsedQuery.data.operating_company_id]
      );
      return res.rows[0] ?? null;
    });
    if (!row) return reply.code(404).send({ error: "catalog_payment_terms_not_found" });
    return row;
  });

  app.patch("/api/v1/catalogs/payment-terms/:id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isCatalogWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedQuery = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return reply.code(400).send({ error: "operating_company_id_required" });
    const parsedBody = updateBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const b = parsedBody.data;
    const opco = parsedQuery.data.operating_company_id;

    const setParts: string[] = [];
    const values: unknown[] = [];
    const add = (col: string, val: unknown) => {
      values.push(val);
      setParts.push(`${col} = $${values.length}`);
    };
    if ("terms_name" in b) add("terms_name", b.terms_name ?? null);
    if ("days_until_due" in b) add("days_until_due", b.days_until_due ?? null);
    if ("early_payment_discount_pct" in b) add("early_payment_discount_pct", b.early_payment_discount_pct ?? null);
    if ("early_payment_discount_days" in b) add("early_payment_discount_days", b.early_payment_discount_days ?? null);
    if ("qbo_terms_id" in b) add("qbo_terms_id", b.qbo_terms_id ?? null);
    if ("notes" in b) add("notes", b.notes ?? null);
    if ("deactivated_at" in b) add("deactivated_at", b.deactivated_at ?? null);
    add("updated_by_user_id", authUser.uuid);
    values.push(parsedParams.data.id);
    const idIdx = values.length;
    values.push(opco);
    const opcoIdx = values.length;

    try {
      const updated = await withEntityScope(authUser.uuid, opco, async (client) => {
        const oldRes = await client.query(
          `
            SELECT ${SELECT_COLS}
            FROM catalogs.payment_terms
            WHERE id = $1 AND operating_company_id = $2::uuid
            LIMIT 1
          `,
          [parsedParams.data.id, opco]
        );
        const oldRow = oldRes.rows[0] ?? null;
        if (!oldRow) return null;

        const res = await client.query(
          `
            UPDATE catalogs.payment_terms
            SET ${setParts.join(", ")}
            WHERE id = $${idIdx} AND operating_company_id = $${opcoIdx}::uuid
            RETURNING ${SELECT_COLS}
          `,
          values
        );
        const updatedRow = res.rows[0] ?? null;
        if (!updatedRow) return null;
        const changes = buildPatchChanges(
          b as unknown as Record<string, unknown>,
          oldRow as Record<string, unknown>,
          updatedRow as Record<string, unknown>
        );
        await appendCrudAudit(client, authUser.uuid, "catalogs.payment_terms.updated", {
          resource_id: updatedRow.id,
          resource_type: "catalogs.payment_terms",
          changes,
        });
        return updatedRow;
      });
      if (!updated) return reply.code(404).send({ error: "catalog_payment_terms_not_found" });
      return updated;
    } catch (err) {
      const code = (err as { code?: string }).code;
      const constraint = (err as { constraint?: string }).constraint;
      if (code === "23505") return reply.code(409).send({ error: mapConflict(constraint), field: constraint ?? null });
      if (code === "23514") return reply.code(400).send({ error: "invalid_payment_terms_check_constraint" });
      throw err;
    }
  });

  app.post("/api/v1/catalogs/payment-terms/:id/deactivate", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isCatalogWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedQuery = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return reply.code(400).send({ error: "operating_company_id_required" });
    const opco = parsedQuery.data.operating_company_id;

    const deactivated = await withEntityScope(authUser.uuid, opco, async (client) => {
      const oldRes = await client.query(
        `
          SELECT id, deactivated_at
          FROM catalogs.payment_terms
          WHERE id = $1 AND operating_company_id = $2::uuid
          LIMIT 1
        `,
        [parsedParams.data.id, opco]
      );
      const oldRow = oldRes.rows[0] ?? null;
      if (!oldRow) return null;

      let deactivatedAt = oldRow.deactivated_at as string | null;
      let wasAlreadyDeactivated = oldRow.deactivated_at !== null;
      if (!wasAlreadyDeactivated) {
        const res = await client.query(
          `
            UPDATE catalogs.payment_terms
            SET deactivated_at = now(), updated_by_user_id = $3
            WHERE id = $1
              AND operating_company_id = $2::uuid
              AND deactivated_at IS NULL
            RETURNING id, deactivated_at
          `,
          [parsedParams.data.id, opco, authUser.uuid]
        );
        deactivatedAt = (res.rows[0]?.deactivated_at as string | undefined) ?? deactivatedAt;
        wasAlreadyDeactivated = false;
      }

      await appendCrudAudit(client, authUser.uuid, "catalogs.payment_terms.deactivated", {
        resource_id: oldRow.id,
        resource_type: "catalogs.payment_terms",
        was_already_deactivated: wasAlreadyDeactivated,
      });

      return { id: oldRow.id, deactivated_at: deactivatedAt, was_already_deactivated: wasAlreadyDeactivated };
    });
    if (!deactivated) return reply.code(404).send({ error: "catalog_payment_terms_not_found" });
    return deactivated;
  });
}
