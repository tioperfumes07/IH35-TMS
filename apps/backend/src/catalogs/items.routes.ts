import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit, buildPatchChanges } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { isCatalogWriteRole } from "../auth/role-helpers.js";
import { requireAuth } from "../auth/session-middleware.js";
import { enqueueTmsItemPushRequested } from "../qbo/tms-item-push-chain.service.js";

const itemTypeSchema = z.enum(["Service", "Inventory", "NonInventory", "Bundle", "Discount", "Charge"]);

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(["active", "inactive"]).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  item_type: itemTypeSchema.optional(),
});

const idParamSchema = z.object({ id: z.string().uuid() });

const createBodySchema = z.object({
  item_name: z.string().trim().min(1).max(200),
  item_code: z.string().trim().max(100).optional(),
  item_type: itemTypeSchema,
  description: z.string().trim().max(2000).optional(),
  unit_price_cents: z.coerce.number().int().optional(),
  default_income_account_id: z.string().uuid().optional(),
  default_expense_account_id: z.string().uuid().optional(),
  default_class_id: z.string().uuid().optional(),
  qbo_item_id: z.string().trim().max(100).optional(),
  taxable: z.boolean().default(false),
  notes: z.string().trim().max(2000).optional(),
  operating_company_id: z.string().uuid().optional(),
});

const updateBodySchema = z
  .object({
    item_name: z.string().trim().min(1).max(200).optional(),
    item_code: z.string().trim().max(100).nullable().optional(),
    item_type: itemTypeSchema.optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    unit_price_cents: z.coerce.number().int().nullable().optional(),
    default_income_account_id: z.string().uuid().nullable().optional(),
    default_expense_account_id: z.string().uuid().nullable().optional(),
    default_class_id: z.string().uuid().nullable().optional(),
    qbo_item_id: z.string().trim().max(100).nullable().optional(),
    taxable: z.boolean().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    deactivated_at: z.string().datetime().nullable().optional(),
    operating_company_id: z.string().uuid().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "at least one field is required" });

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function mapItemConflict(constraint?: string): string {
  if (!constraint) return "catalog_item_conflict";
  if (constraint.includes("item_name")) return "catalog_item_conflict_item_name";
  if (constraint.includes("item_code")) return "catalog_item_conflict_item_code";
  if (constraint.includes("qbo_item_id")) return "catalog_item_conflict_qbo_item_id";
  return "catalog_item_conflict";
}

async function resolveOperatingCompanyId(
  client: { query: (sql: string, values: unknown[]) => Promise<{ rows: Array<{ id: string }> }> },
  userId: string,
  requested?: string,
) {
  if (requested) return requested;
  const res = await client.query(
    `
      SELECT c.id
      FROM identity.users u
      JOIN org.companies c ON c.id = u.default_company_id
      WHERE u.id = $1::uuid
        AND c.deactivated_at IS NULL
      UNION
      SELECT c.id
      FROM org.companies c
      WHERE c.id IN (SELECT org.user_accessible_company_ids())
      ORDER BY id
      LIMIT 1
    `,
    [userId],
  );
  return res.rows[0]?.id ?? null;
}

export async function registerItemRoutes(app: FastifyInstance) {
  app.get("/api/v1/catalogs/items", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsed = listQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);
    const { limit, offset, status, search, item_type } = parsed.data;

    const items = await withCurrentUser(authUser.uuid, async (client) => {
      const values: unknown[] = [];
      const filters: string[] = [];
      if (status === "active") filters.push("deactivated_at IS NULL");
      if (status === "inactive") filters.push("deactivated_at IS NOT NULL");
      if (search) {
        values.push(`%${search}%`);
        const idx = values.length;
        filters.push(`(item_name ILIKE $${idx} OR item_code ILIKE $${idx} OR qbo_item_id ILIKE $${idx})`);
      }
      if (item_type) {
        values.push(item_type);
        filters.push(`item_type = $${values.length}`);
      }
      values.push(limit);
      values.push(offset);
      const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
      const res = await client.query(
        `
          SELECT
            id, item_name, item_code, item_type, description, unit_price_cents,
            default_income_account_id, default_expense_account_id, default_class_id,
            qbo_item_id, taxable, notes,
            created_at, updated_at, deactivated_at, created_by_user_id, updated_by_user_id
          FROM catalogs.items
          ${whereClause}
          ORDER BY created_at DESC
          LIMIT $${values.length - 1}
          OFFSET $${values.length}
        `,
        values
      );
      return res.rows;
    });

    return { items };
  });

  app.post("/api/v1/catalogs/items", async (req, reply) => {
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
            INSERT INTO catalogs.items (
              item_name, item_code, item_type, description, unit_price_cents,
              default_income_account_id, default_expense_account_id, default_class_id,
              qbo_item_id, taxable, notes, created_by_user_id, updated_by_user_id
            ) VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12
            )
            RETURNING
              id, item_name, item_code, item_type, description, unit_price_cents,
              default_income_account_id, default_expense_account_id, default_class_id,
              qbo_item_id, taxable, notes,
              created_at, updated_at, deactivated_at, created_by_user_id, updated_by_user_id
          `,
          [
            b.item_name,
            b.item_code ?? null,
            b.item_type,
            b.description ?? null,
            b.unit_price_cents ?? null,
            b.default_income_account_id ?? null,
            b.default_expense_account_id ?? null,
            b.default_class_id ?? null,
            b.qbo_item_id ?? null,
            b.taxable,
            b.notes ?? null,
            authUser.uuid,
          ]
        );
        const row = res.rows[0];
        await appendCrudAudit(client, authUser.uuid, "catalogs.items.created", {
          resource_id: row.id,
          resource_type: "catalogs.items",
          id: row.id,
          item_name: row.item_name,
          item_code: row.item_code,
          item_type: row.item_type,
        });
        const operatingCompanyId = await resolveOperatingCompanyId(client, authUser.uuid, b.operating_company_id);
        if (operatingCompanyId) {
          await enqueueTmsItemPushRequested(client, {
            operating_company_id: operatingCompanyId,
            item_id: String(row.id),
            operation: "create",
          });
        }
        return row;
      });
      return reply.code(201).send(created);
    } catch (err) {
      const code = (err as { code?: string }).code;
      const constraint = (err as { constraint?: string }).constraint;
      if (code === "23505") return reply.code(409).send({ error: mapItemConflict(constraint), field: constraint ?? null });
      if (code === "23503") return reply.code(400).send({ error: "invalid_account_or_class_reference" });
      if (code === "23514") return reply.code(400).send({ error: "invalid_item_check_constraint" });
      throw err;
    }
  });

  app.get("/api/v1/catalogs/items/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const row = await withCurrentUser(authUser.uuid, async (client) => {
      const res = await client.query(
        `
          SELECT
            id, item_name, item_code, item_type, description, unit_price_cents,
            default_income_account_id, default_expense_account_id, default_class_id,
            qbo_item_id, taxable, notes,
            created_at, updated_at, deactivated_at, created_by_user_id, updated_by_user_id
          FROM catalogs.items
          WHERE id = $1
          LIMIT 1
        `,
        [parsedParams.data.id]
      );
      return res.rows[0] ?? null;
    });

    if (!row) return reply.code(404).send({ error: "catalog_item_not_found" });
    return row;
  });

  app.patch("/api/v1/catalogs/items/:id", async (req, reply) => {
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
    if ("item_name" in b) add("item_name", b.item_name ?? null);
    if ("item_code" in b) add("item_code", b.item_code ?? null);
    if ("item_type" in b) add("item_type", b.item_type);
    if ("description" in b) add("description", b.description ?? null);
    if ("unit_price_cents" in b) add("unit_price_cents", b.unit_price_cents ?? null);
    if ("default_income_account_id" in b) add("default_income_account_id", b.default_income_account_id ?? null);
    if ("default_expense_account_id" in b) add("default_expense_account_id", b.default_expense_account_id ?? null);
    if ("default_class_id" in b) add("default_class_id", b.default_class_id ?? null);
    if ("qbo_item_id" in b) add("qbo_item_id", b.qbo_item_id ?? null);
    if ("taxable" in b) add("taxable", b.taxable);
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
              id, item_name, item_code, item_type, description, unit_price_cents,
              default_income_account_id, default_expense_account_id, default_class_id,
              qbo_item_id, taxable, notes,
              created_at, updated_at, deactivated_at, created_by_user_id, updated_by_user_id
            FROM catalogs.items
            WHERE id = $1
            LIMIT 1
          `,
          [parsedParams.data.id]
        );
        const oldRow = oldRes.rows[0] ?? null;
        if (!oldRow) return null;

        const res = await client.query(
          `
            UPDATE catalogs.items
            SET ${setParts.join(", ")}
            WHERE id = $${idIdx}
            RETURNING
              id, item_name, item_code, item_type, description, unit_price_cents,
              default_income_account_id, default_expense_account_id, default_class_id,
              qbo_item_id, taxable, notes,
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
        await appendCrudAudit(client, authUser.uuid, "catalogs.items.updated", {
          resource_id: updatedRow.id,
          resource_type: "catalogs.items",
          changes,
        });
        const operatingCompanyId = await resolveOperatingCompanyId(client, authUser.uuid, b.operating_company_id);
        if (operatingCompanyId) {
          await enqueueTmsItemPushRequested(client, {
            operating_company_id: operatingCompanyId,
            item_id: String(updatedRow.id),
            operation: "update",
          });
        }
        return updatedRow;
      });
      if (!updated) return reply.code(404).send({ error: "catalog_item_not_found" });
      return updated;
    } catch (err) {
      const code = (err as { code?: string }).code;
      const constraint = (err as { constraint?: string }).constraint;
      if (code === "23505") return reply.code(409).send({ error: mapItemConflict(constraint), field: constraint ?? null });
      if (code === "23503") return reply.code(400).send({ error: "invalid_account_or_class_reference" });
      if (code === "23514") return reply.code(400).send({ error: "invalid_item_check_constraint" });
      throw err;
    }
  });

  app.post("/api/v1/catalogs/items/:id/deactivate", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isCatalogWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const deactivated = await withCurrentUser(authUser.uuid, async (client) => {
      const oldRes = await client.query(
        `
          SELECT id, deactivated_at
          FROM catalogs.items
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
            UPDATE catalogs.items
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

      await appendCrudAudit(client, authUser.uuid, "catalogs.items.deactivated", {
        resource_id: oldRow.id,
        resource_type: "catalogs.items",
        was_already_deactivated: wasAlreadyDeactivated,
      });
      const operatingCompanyId = await resolveOperatingCompanyId(client, authUser.uuid);
      if (operatingCompanyId) {
        await enqueueTmsItemPushRequested(client, {
          operating_company_id: operatingCompanyId,
          item_id: String(oldRow.id),
          operation: "update",
        });
      }

      return { id: oldRow.id, deactivated_at: deactivatedAt, was_already_deactivated: wasAlreadyDeactivated };
    });
    if (!deactivated) return reply.code(404).send({ error: "catalog_item_not_found" });
    return deactivated;
  });
}
