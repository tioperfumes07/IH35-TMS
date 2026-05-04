import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit, buildPatchChanges } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { isCatalogWriteRole } from "../auth/role-helpers.js";
import { requireAuth } from "../auth/session-middleware.js";

const accountTypeSchema = z.enum([
  "Asset",
  "Liability",
  "Equity",
  "Income",
  "Expense",
  "CostOfGoodsSold",
  "OtherIncome",
  "OtherExpense",
]);

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(["active", "inactive"]).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  account_type: accountTypeSchema.optional(),
  parent_account_id: z.string().uuid().optional(),
});

const idParamSchema = z.object({ id: z.string().uuid() });

const createAccountBodySchema = z.object({
  account_number: z.string().trim().min(1).max(50),
  account_name: z.string().trim().min(1).max(200),
  account_type: accountTypeSchema,
  account_subtype: z.string().trim().max(100).optional(),
  parent_account_id: z.string().uuid().optional(),
  qbo_account_id: z.string().trim().max(100).optional(),
  qbo_account_qrn: z.string().trim().max(200).optional(),
  is_postable: z.boolean().default(true),
  currency_code: z.string().trim().regex(/^[A-Z]{3}$/).default("USD"),
  opening_balance_cents: z.coerce.number().int().optional(),
  notes: z.string().trim().max(2000).optional(),
});

const updateAccountBodySchema = z
  .object({
    account_number: z.string().trim().min(1).max(50).optional(),
    account_name: z.string().trim().min(1).max(200).optional(),
    account_type: accountTypeSchema.optional(),
    account_subtype: z.string().trim().max(100).nullable().optional(),
    parent_account_id: z.string().uuid().nullable().optional(),
    qbo_account_id: z.string().trim().max(100).nullable().optional(),
    qbo_account_qrn: z.string().trim().max(200).nullable().optional(),
    is_postable: z.boolean().optional(),
    currency_code: z.string().trim().regex(/^[A-Z]{3}$/).optional(),
    opening_balance_cents: z.coerce.number().int().nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    deactivated_at: z.string().datetime().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "at least one field is required" });

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function mapAccountConflict(constraint?: string): string {
  if (!constraint) return "catalog_account_conflict";
  if (constraint.includes("account_number")) return "catalog_account_conflict_account_number";
  if (constraint.includes("qbo_account_id")) return "catalog_account_conflict_qbo_account_id";
  return "catalog_account_conflict";
}

export async function registerAccountRoutes(app: FastifyInstance) {
  app.get("/api/v1/catalogs/accounts", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsed = listQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);
    const { limit, offset, status, search, account_type, parent_account_id } = parsed.data;

    const accounts = await withCurrentUser(authUser.uuid, async (client) => {
      const values: unknown[] = [];
      const filters: string[] = [];
      if (status === "active") filters.push("deactivated_at IS NULL");
      if (status === "inactive") filters.push("deactivated_at IS NOT NULL");
      if (search) {
        values.push(`%${search}%`);
        const idx = values.length;
        filters.push(`(account_number ILIKE $${idx} OR account_name ILIKE $${idx})`);
      }
      if (account_type) {
        values.push(account_type);
        filters.push(`account_type = $${values.length}`);
      }
      if (parent_account_id) {
        values.push(parent_account_id);
        filters.push(`parent_account_id = $${values.length}`);
      }
      values.push(limit);
      values.push(offset);
      const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
      const res = await client.query(
        `
          SELECT
            id, account_number, account_name, account_type, account_subtype, parent_account_id,
            qbo_account_id, qbo_account_qrn, is_postable, currency_code, opening_balance_cents, notes,
            created_at, updated_at, deactivated_at, created_by_user_id, updated_by_user_id
          FROM catalogs.accounts
          ${whereClause}
          ORDER BY created_at DESC
          LIMIT $${values.length - 1}
          OFFSET $${values.length}
        `,
        values
      );
      return res.rows;
    });

    return { accounts };
  });

  app.post("/api/v1/catalogs/accounts", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isCatalogWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsed = createAccountBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);
    const b = parsed.data;

    try {
      const created = await withCurrentUser(authUser.uuid, async (client) => {
        const res = await client.query(
          `
            INSERT INTO catalogs.accounts (
              account_number, account_name, account_type, account_subtype, parent_account_id,
              qbo_account_id, qbo_account_qrn, is_postable, currency_code, opening_balance_cents, notes,
              created_by_user_id, updated_by_user_id
            ) VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12
            )
            RETURNING
              id, account_number, account_name, account_type, account_subtype, parent_account_id,
              qbo_account_id, qbo_account_qrn, is_postable, currency_code, opening_balance_cents, notes,
              created_at, updated_at, deactivated_at, created_by_user_id, updated_by_user_id
          `,
          [
            b.account_number,
            b.account_name,
            b.account_type,
            b.account_subtype ?? null,
            b.parent_account_id ?? null,
            b.qbo_account_id ?? null,
            b.qbo_account_qrn ?? null,
            b.is_postable,
            b.currency_code,
            b.opening_balance_cents ?? null,
            b.notes ?? null,
            authUser.uuid,
          ]
        );
        const row = res.rows[0];
        await appendCrudAudit(client, authUser.uuid, "catalogs.accounts.created", {
          resource_id: row.id,
          resource_type: "catalogs.accounts",
          id: row.id,
          account_number: row.account_number,
          account_name: row.account_name,
          account_type: row.account_type,
        });
        return row;
      });
      return reply.code(201).send(created);
    } catch (err) {
      const code = (err as { code?: string }).code;
      const constraint = (err as { constraint?: string }).constraint;
      if (code === "23505") return reply.code(409).send({ error: mapAccountConflict(constraint), field: constraint ?? null });
      if (code === "23503") return reply.code(400).send({ error: "invalid_parent_account_id" });
      if (code === "23514") return reply.code(400).send({ error: "invalid_account_check_constraint" });
      throw err;
    }
  });

  app.get("/api/v1/catalogs/accounts/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const row = await withCurrentUser(authUser.uuid, async (client) => {
      const res = await client.query(
        `
          SELECT
            id, account_number, account_name, account_type, account_subtype, parent_account_id,
            qbo_account_id, qbo_account_qrn, is_postable, currency_code, opening_balance_cents, notes,
            created_at, updated_at, deactivated_at, created_by_user_id, updated_by_user_id
          FROM catalogs.accounts
          WHERE id = $1
          LIMIT 1
        `,
        [parsedParams.data.id]
      );
      return res.rows[0] ?? null;
    });

    if (!row) return reply.code(404).send({ error: "catalog_account_not_found" });
    return row;
  });

  app.patch("/api/v1/catalogs/accounts/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isCatalogWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = updateAccountBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const b = parsedBody.data;

    if (b.parent_account_id && b.parent_account_id === parsedParams.data.id) {
      return reply.code(400).send({ error: "cannot_self_reference" });
    }

    const setParts: string[] = [];
    const values: unknown[] = [];
    const add = (col: string, val: unknown) => {
      values.push(val);
      setParts.push(`${col} = $${values.length}`);
    };
    if ("account_number" in b) add("account_number", b.account_number ?? null);
    if ("account_name" in b) add("account_name", b.account_name ?? null);
    if ("account_type" in b) add("account_type", b.account_type);
    if ("account_subtype" in b) add("account_subtype", b.account_subtype ?? null);
    if ("parent_account_id" in b) add("parent_account_id", b.parent_account_id ?? null);
    if ("qbo_account_id" in b) add("qbo_account_id", b.qbo_account_id ?? null);
    if ("qbo_account_qrn" in b) add("qbo_account_qrn", b.qbo_account_qrn ?? null);
    if ("is_postable" in b) add("is_postable", b.is_postable);
    if ("currency_code" in b) add("currency_code", b.currency_code ?? null);
    if ("opening_balance_cents" in b) add("opening_balance_cents", b.opening_balance_cents ?? null);
    if ("notes" in b) add("notes", b.notes ?? null);
    if ("deactivated_at" in b) add("deactivated_at", b.deactivated_at ?? null);
    add("updated_by_user_id", authUser.uuid);
    values.push(parsedParams.data.id);
    const idIdx = values.length;

    try {
      const updated = await withCurrentUser(authUser.uuid, async (client) => {
        const oldRes = await client.query(
          `
            SELECT
              id, account_number, account_name, account_type, account_subtype, parent_account_id,
              qbo_account_id, qbo_account_qrn, is_postable, currency_code, opening_balance_cents, notes,
              created_at, updated_at, deactivated_at, created_by_user_id, updated_by_user_id
            FROM catalogs.accounts
            WHERE id = $1
            LIMIT 1
          `,
          [parsedParams.data.id]
        );
        const oldRow = oldRes.rows[0] ?? null;
        if (!oldRow) return null;

        const res = await client.query(
          `
            UPDATE catalogs.accounts
            SET ${setParts.join(", ")}
            WHERE id = $${idIdx}
            RETURNING
              id, account_number, account_name, account_type, account_subtype, parent_account_id,
              qbo_account_id, qbo_account_qrn, is_postable, currency_code, opening_balance_cents, notes,
              created_at, updated_at, deactivated_at, created_by_user_id, updated_by_user_id
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
        await appendCrudAudit(client, authUser.uuid, "catalogs.accounts.updated", {
          resource_id: updatedRow.id,
          resource_type: "catalogs.accounts",
          changes,
        });
        return updatedRow;
      });
      if (!updated) return reply.code(404).send({ error: "catalog_account_not_found" });
      return updated;
    } catch (err) {
      const code = (err as { code?: string }).code;
      const constraint = (err as { constraint?: string }).constraint;
      if (code === "23505") return reply.code(409).send({ error: mapAccountConflict(constraint), field: constraint ?? null });
      if (code === "23503") return reply.code(400).send({ error: "invalid_parent_account_id" });
      if (code === "23514") return reply.code(400).send({ error: "invalid_account_check_constraint" });
      throw err;
    }
  });

  app.post("/api/v1/catalogs/accounts/:id/deactivate", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isCatalogWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const deactivated = await withCurrentUser(authUser.uuid, async (client) => {
      const oldRes = await client.query(
        `
          SELECT id, deactivated_at
          FROM catalogs.accounts
          WHERE id = $1
          LIMIT 1
        `,
        [parsedParams.data.id]
      );
      const oldRow = oldRes.rows[0] ?? null;
      if (!oldRow) return null;

      let deactivatedAt = oldRow.deactivated_at as string | null;
      let wasAlreadyDeactivated = oldRow.deactivated_at !== null;
      if (!wasAlreadyDeactivated) {
        const res = await client.query(
          `
            UPDATE catalogs.accounts
            SET deactivated_at = now(), updated_by_user_id = $2
            WHERE id = $1
              AND deactivated_at IS NULL
            RETURNING id, deactivated_at
          `,
          [parsedParams.data.id, authUser.uuid]
        );
        deactivatedAt = (res.rows[0]?.deactivated_at as string | undefined) ?? deactivatedAt;
        wasAlreadyDeactivated = false;
      }

      await appendCrudAudit(client, authUser.uuid, "catalogs.accounts.deactivated", {
        resource_id: oldRow.id,
        resource_type: "catalogs.accounts",
        was_already_deactivated: wasAlreadyDeactivated,
      });

      return { id: oldRow.id, deactivated_at: deactivatedAt, was_already_deactivated: wasAlreadyDeactivated };
    });
    if (!deactivated) return reply.code(404).send({ error: "catalog_account_not_found" });
    return deactivated;
  });
}
