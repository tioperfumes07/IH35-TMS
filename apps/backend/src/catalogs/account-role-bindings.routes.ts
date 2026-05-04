import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit, buildPatchChanges } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { isCatalogWriteRole } from "../auth/role-helpers.js";
import { requireAuth } from "../auth/session-middleware.js";

const roleKeySchema = z.enum([
  "ar_clearing",
  "ap_clearing",
  "cash_dip",
  "cash_payroll",
  "cash_petty",
  "fuel_expense",
  "maintenance_expense",
  "driver_payroll_clearing",
  "factor_advances_receivable",
  "factor_chargebacks_payable",
  "undeposited_funds",
]);

const ROLE_KEYS = roleKeySchema.options;

const idParamSchema = z.object({ id: z.string().uuid() });

const createBodySchema = z.object({
  role_key: roleKeySchema,
  account_id: z.string().uuid(),
  description: z.string().trim().max(2000).optional(),
});

const updateBodySchema = z
  .object({
    role_key: roleKeySchema.optional(),
    account_id: z.string().uuid().optional(),
    description: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "at least one field is required" });

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

async function findBindingIdByRoleKey(authUserId: string, roleKey: string): Promise<string | null> {
  return withCurrentUser(authUserId, async (client) => {
    const res = await client.query(`SELECT id FROM catalogs.account_role_bindings WHERE role_key = $1 LIMIT 1`, [roleKey]);
    return (res.rows[0]?.id as string | undefined) ?? null;
  });
}

export async function registerAccountRoleBindingRoutes(app: FastifyInstance) {
  app.get("/api/v1/catalogs/account-role-bindings", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;

    const account_role_bindings = await withCurrentUser(authUser.uuid, async (client) => {
      const res = await client.query(
        `
          WITH role_keys AS (
            SELECT unnest($1::text[]) AS role_key
          )
          SELECT
            b.id,
            r.role_key,
            b.account_id,
            b.description,
            b.created_at,
            b.updated_at,
            b.deactivated_at,
            b.created_by_user_id,
            b.updated_by_user_id,
            (b.id IS NOT NULL) AS is_bound
          FROM role_keys r
          LEFT JOIN catalogs.account_role_bindings b
            ON b.role_key = r.role_key
          ORDER BY r.role_key
        `,
        [ROLE_KEYS]
      );
      return res.rows;
    });

    return { account_role_bindings };
  });

  app.post("/api/v1/catalogs/account-role-bindings", async (req, reply) => {
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
            INSERT INTO catalogs.account_role_bindings (
              role_key, account_id, description, created_by_user_id, updated_by_user_id
            ) VALUES (
              $1,$2,$3,$4,$4
            )
            RETURNING
              id, role_key, account_id, description, created_at, updated_at, deactivated_at,
              created_by_user_id, updated_by_user_id
          `,
          [b.role_key, b.account_id, b.description ?? null, authUser.uuid]
        );
        const row = res.rows[0];
        await appendCrudAudit(
          client,
          authUser.uuid,
          "catalogs.account_role_bindings.created",
          {
            resource_id: row.id,
            resource_type: "catalogs.account_role_bindings",
            id: row.id,
            role_key: row.role_key,
            account_id: row.account_id,
          },
          "warning"
        );
        return row;
      });
      return reply.code(201).send(created);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "23505") {
        const existingBindingId = await findBindingIdByRoleKey(authUser.uuid, b.role_key);
        return reply.code(409).send({ error: "role_key_already_bound", existing_binding_id: existingBindingId });
      }
      if (code === "23503") return reply.code(400).send({ error: "invalid_account_id" });
      throw err;
    }
  });

  app.get("/api/v1/catalogs/account-role-bindings/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const row = await withCurrentUser(authUser.uuid, async (client) => {
      const res = await client.query(
        `
          SELECT
            id, role_key, account_id, description, created_at, updated_at, deactivated_at,
            created_by_user_id, updated_by_user_id
          FROM catalogs.account_role_bindings
          WHERE id = $1
          LIMIT 1
        `,
        [parsedParams.data.id]
      );
      return res.rows[0] ?? null;
    });

    if (!row) return reply.code(404).send({ error: "catalog_account_role_binding_not_found" });
    return row;
  });

  app.patch("/api/v1/catalogs/account-role-bindings/:id", async (req, reply) => {
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
    if ("role_key" in b) add("role_key", b.role_key ?? null);
    if ("account_id" in b) add("account_id", b.account_id ?? null);
    if ("description" in b) add("description", b.description ?? null);
    add("updated_by_user_id", authUser.uuid);
    values.push(parsedParams.data.id);
    const idIdx = values.length;

    try {
      const updated = await withCurrentUser(authUser.uuid, async (client) => {
        const oldRes = await client.query(
          `
            SELECT
              id, role_key, account_id, description, created_at, updated_at, deactivated_at,
              created_by_user_id, updated_by_user_id
            FROM catalogs.account_role_bindings
            WHERE id = $1
            LIMIT 1
          `,
          [parsedParams.data.id]
        );
        const oldRow = oldRes.rows[0] ?? null;
        if (!oldRow) return null;

        const res = await client.query(
          `
            UPDATE catalogs.account_role_bindings
            SET ${setParts.join(", ")}
            WHERE id = $${idIdx}
            RETURNING
              id, role_key, account_id, description, created_at, updated_at, deactivated_at,
              created_by_user_id, updated_by_user_id
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
        await appendCrudAudit(
          client,
          authUser.uuid,
          "catalogs.account_role_bindings.updated",
          {
            resource_id: updatedRow.id,
            resource_type: "catalogs.account_role_bindings",
            changes,
          },
          "warning"
        );
        return updatedRow;
      });
      if (!updated) return reply.code(404).send({ error: "catalog_account_role_binding_not_found" });
      return updated;
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "23505") {
        const key = b.role_key;
        const existingBindingId = key ? await findBindingIdByRoleKey(authUser.uuid, key) : null;
        return reply.code(409).send({ error: "role_key_already_bound", existing_binding_id: existingBindingId });
      }
      if (code === "23503") return reply.code(400).send({ error: "invalid_account_id" });
      throw err;
    }
  });
}
