import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { isCatalogWriteRole } from "../auth/role-helpers.js";
import { requireAuth } from "../auth/session-middleware.js";

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(["active", "inactive"]).optional(),
  search: z.string().trim().min(1).max(100).optional(),
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
  if (!requireAuth(req, reply)) return null;
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

export async function registerPaymentTermsRoutes(app: FastifyInstance) {
  app.get("/api/v1/catalogs/payment-terms", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsed = listQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);
    const { limit, offset, status, search } = parsed.data;

    const payment_terms = await withCurrentUser(authUser.uuid, async (client) => {
      const values: unknown[] = [];
      const filters: string[] = [];
      if (status === "active") filters.push("deactivated_at IS NULL");
      if (status === "inactive") filters.push("deactivated_at IS NOT NULL");
      if (search) {
        values.push(`%${search}%`);
        const idx = values.length;
        filters.push(`(terms_name ILIKE $${idx} OR qbo_terms_id ILIKE $${idx})`);
      }
      values.push(limit);
      values.push(offset);
      const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
      const res = await client.query(
        `
          SELECT
            id, terms_name, days_until_due, early_payment_discount_pct, early_payment_discount_days, qbo_terms_id, notes,
            created_at, updated_at, deactivated_at, created_by_user_id, updated_by_user_id
          FROM catalogs.payment_terms
          ${whereClause}
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

  app.post("/api/v1/catalogs/payment-terms", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isCatalogWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsed = createBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);
    const b = parsed.data;

    try {
      const created = await withCurrentUser(authUser.uuid, async (client) => {
        const res = await client.query(
          `
            INSERT INTO catalogs.payment_terms (
              terms_name, days_until_due, early_payment_discount_pct, early_payment_discount_days, qbo_terms_id, notes,
              created_by_user_id, updated_by_user_id
            ) VALUES (
              $1,$2,$3,$4,$5,$6,$7,$7
            )
            RETURNING
              id, terms_name, days_until_due, early_payment_discount_pct, early_payment_discount_days, qbo_terms_id, notes,
              created_at, updated_at, deactivated_at, created_by_user_id, updated_by_user_id
          `,
          [
            b.terms_name,
            b.days_until_due,
            b.early_payment_discount_pct ?? null,
            b.early_payment_discount_days ?? null,
            b.qbo_terms_id ?? null,
            b.notes ?? null,
            authUser.uuid,
          ]
        );
        return res.rows[0];
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

  app.get("/api/v1/catalogs/payment-terms/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const row = await withCurrentUser(authUser.uuid, async (client) => {
      const res = await client.query(
        `
          SELECT
            id, terms_name, days_until_due, early_payment_discount_pct, early_payment_discount_days, qbo_terms_id, notes,
            created_at, updated_at, deactivated_at, created_by_user_id, updated_by_user_id
          FROM catalogs.payment_terms
          WHERE id = $1
          LIMIT 1
        `,
        [parsedParams.data.id]
      );
      return res.rows[0] ?? null;
    });
    if (!row) return reply.code(404).send({ error: "catalog_payment_terms_not_found" });
    return row;
  });

  app.patch("/api/v1/catalogs/payment-terms/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isCatalogWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = updateBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const b = parsedBody.data;

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

    try {
      const updated = await withCurrentUser(authUser.uuid, async (client) => {
        const res = await client.query(
          `
            UPDATE catalogs.payment_terms
            SET ${setParts.join(", ")}
            WHERE id = $${idIdx}
            RETURNING
              id, terms_name, days_until_due, early_payment_discount_pct, early_payment_discount_days, qbo_terms_id, notes,
              created_at, updated_at, deactivated_at, created_by_user_id, updated_by_user_id
          `,
          values
        );
        return res.rows[0] ?? null;
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

  app.post("/api/v1/catalogs/payment-terms/:id/deactivate", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isCatalogWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const deactivated = await withCurrentUser(authUser.uuid, async (client) => {
      const res = await client.query(
        `
          UPDATE catalogs.payment_terms
          SET deactivated_at = now(), updated_by_user_id = $2
          WHERE id = $1
            AND deactivated_at IS NULL
          RETURNING id, deactivated_at
        `,
        [parsedParams.data.id, authUser.uuid]
      );
      return res.rows[0] ?? null;
    });
    if (!deactivated) return reply.code(404).send({ error: "catalog_payment_terms_not_found" });
    return deactivated;
  });
}
