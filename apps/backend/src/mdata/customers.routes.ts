import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit, buildPatchChanges } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(["active", "inactive"]).optional(),
  search: z.string().trim().min(1).max(100).optional(),
});

const idParamSchema = z.object({ id: z.string().uuid() });

const createCustomerBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  customer_code: z.string().trim().max(100).optional(),
  email: z
    .string()
    .email()
    .transform((v) => v.toLowerCase())
    .optional(),
  phone: z.string().trim().max(50).optional(),
  billing_address: z.string().trim().max(500).optional(),
  mc_number: z.string().trim().max(100).optional(),
  dot_number: z.string().trim().max(100).optional(),
  payment_terms_id: z.string().uuid().nullable().optional(),
  notes: z.string().trim().max(2000).optional(),
});

const updateCustomerBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    customer_code: z.string().trim().max(100).nullable().optional(),
    email: z
      .string()
      .email()
      .transform((v) => v.toLowerCase())
      .nullable()
      .optional(),
    phone: z.string().trim().max(50).nullable().optional(),
    billing_address: z.string().trim().max(500).nullable().optional(),
    mc_number: z.string().trim().max(100).nullable().optional(),
    dot_number: z.string().trim().max(100).nullable().optional(),
    payment_terms_id: z.string().uuid().nullable().optional(),
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

function isWriteRole(role: string): boolean {
  return role === "Owner" || role === "Administrator" || role === "Manager";
}

async function assertUniqueCustomerFields(
  authUserId: string,
  payload: { name?: string | null; mc_number?: string | null; dot_number?: string | null },
  excludeId?: string
): Promise<null | "name" | "mc_number" | "dot_number"> {
  const conflict = await withCurrentUser(authUserId, async (client) => {
    const checks: Array<{ key: "name" | "mc_number" | "dot_number"; sql: string; value: string }> = [];
    if (payload.name) checks.push({ key: "name", sql: "customer_name", value: payload.name });
    if (payload.mc_number) checks.push({ key: "mc_number", sql: "mc_number", value: payload.mc_number });
    if (payload.dot_number) checks.push({ key: "dot_number", sql: "dot_number", value: payload.dot_number });

    for (const check of checks) {
      const values: unknown[] = [check.value];
      let where = `${check.sql} = $1`;
      if (excludeId) {
        values.push(excludeId);
        where += " AND id <> $2";
      }
      const res = await client.query(`SELECT id FROM mdata.customers WHERE ${where} LIMIT 1`, values);
      if (res.rows.length > 0) return check.key;
    }
    return null;
  });
  return conflict;
}

export async function registerCustomerRoutes(app: FastifyInstance) {
  app.get("/api/v1/mdata/customers", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedQuery = listQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

    const { limit, offset, status, search } = parsedQuery.data;
    const customers = await withCurrentUser(authUser.uuid, async (client) => {
      const values: unknown[] = [];
      const filters: string[] = [];
      if (status === "active") filters.push("deactivated_at IS NULL");
      if (status === "inactive") filters.push("deactivated_at IS NOT NULL");
      if (search) {
        values.push(`%${search}%`);
        const idx = values.length;
        filters.push(
          `(customer_name ILIKE $${idx} OR customer_code ILIKE $${idx} OR mc_number ILIKE $${idx} OR dot_number ILIKE $${idx} OR billing_email ILIKE $${idx})`
        );
      }
      values.push(limit);
      values.push(offset);
      const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
      const res = await client.query(
        `
          SELECT
            id,
            customer_name AS name,
            customer_code,
            billing_email AS email,
            billing_phone AS phone,
            billing_address_line1 AS billing_address,
            mc_number,
            dot_number,
            payment_terms_id,
            notes,
            created_at,
            updated_at,
            deactivated_at,
            created_by_user_id,
            updated_by_user_id
          FROM mdata.customers
          ${whereClause}
          ORDER BY created_at DESC
          LIMIT $${values.length - 1}
          OFFSET $${values.length}
        `,
        values
      );
      return res.rows;
    });
    return { customers };
  });

  app.post("/api/v1/mdata/customers", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedBody = createCustomerBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const b = parsedBody.data;

    const conflict = await assertUniqueCustomerFields(authUser.uuid, b);
    if (conflict) return reply.code(409).send({ error: `mdata_customer_${conflict}_conflict` });

    try {
      const created = await withCurrentUser(authUser.uuid, async (client) => {
        const res = await client.query(
          `
            INSERT INTO mdata.customers (
              customer_name, customer_code, billing_email, billing_phone, billing_address_line1,
              mc_number, dot_number, payment_terms_id, notes, created_by_user_id, updated_by_user_id
            ) VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10
            )
            RETURNING
              id,
              customer_name AS name,
              customer_code,
              billing_email AS email,
              billing_phone AS phone,
              billing_address_line1 AS billing_address,
              mc_number,
              dot_number,
              payment_terms_id,
              notes,
              created_at,
              updated_at,
              deactivated_at,
              created_by_user_id,
              updated_by_user_id
          `,
          [
            b.name,
            b.customer_code ?? null,
            b.email ?? null,
            b.phone ?? null,
            b.billing_address ?? null,
            b.mc_number ?? null,
            b.dot_number ?? null,
            b.payment_terms_id ?? null,
            b.notes ?? null,
            authUser.uuid,
          ]
        );
        const row = res.rows[0];
        await appendCrudAudit(client, authUser.uuid, "mdata.customers.created", {
          resource_id: row.id,
          resource_type: "mdata.customers",
          id: row.id,
          name: row.name,
          customer_code: row.customer_code,
          email: row.email,
        });
        return row;
      });
      return reply.code(201).send(created);
    } catch (err) {
      if ((err as { code?: string }).code === "23505") {
        return reply.code(409).send({ error: "mdata_customer_conflict" });
      }
      throw err;
    }
  });

  app.get("/api/v1/mdata/customers/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const row = await withCurrentUser(authUser.uuid, async (client) => {
      const res = await client.query(
        `
          SELECT
            id,
            customer_name AS name,
            customer_code,
            billing_email AS email,
            billing_phone AS phone,
            billing_address_line1 AS billing_address,
            mc_number,
            dot_number,
            payment_terms_id,
            notes,
            created_at,
            updated_at,
            deactivated_at,
            created_by_user_id,
            updated_by_user_id
          FROM mdata.customers
          WHERE id = $1
          LIMIT 1
        `,
        [parsedParams.data.id]
      );
      return res.rows[0] ?? null;
    });

    if (!row) return reply.code(404).send({ error: "mdata_customer_not_found" });
    return row;
  });

  app.patch("/api/v1/mdata/customers/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = updateCustomerBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const b = parsedBody.data;

    const conflict = await assertUniqueCustomerFields(
      authUser.uuid,
      {
        name: b.name ?? null,
        mc_number: b.mc_number ?? null,
        dot_number: b.dot_number ?? null,
      },
      parsedParams.data.id
    );
    if (conflict) return reply.code(409).send({ error: `mdata_customer_${conflict}_conflict` });

    const setParts: string[] = [];
    const values: unknown[] = [];
    const add = (col: string, val: unknown) => {
      values.push(val);
      setParts.push(`${col} = $${values.length}`);
    };
    if ("name" in b) add("customer_name", b.name ?? null);
    if ("customer_code" in b) add("customer_code", b.customer_code ?? null);
    if ("email" in b) add("billing_email", b.email ?? null);
    if ("phone" in b) add("billing_phone", b.phone ?? null);
    if ("billing_address" in b) add("billing_address_line1", b.billing_address ?? null);
    if ("mc_number" in b) add("mc_number", b.mc_number ?? null);
    if ("dot_number" in b) add("dot_number", b.dot_number ?? null);
    if ("payment_terms_id" in b) add("payment_terms_id", b.payment_terms_id ?? null);
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
              id,
              customer_name AS name,
              customer_code,
              billing_email AS email,
              billing_phone AS phone,
              billing_address_line1 AS billing_address,
              mc_number,
              dot_number,
              payment_terms_id,
              notes,
              created_at,
              updated_at,
              deactivated_at,
              created_by_user_id,
              updated_by_user_id
            FROM mdata.customers
            WHERE id = $1
            LIMIT 1
          `,
          [parsedParams.data.id]
        );
        const oldRow = oldRes.rows[0] ?? null;
        if (!oldRow) return null;

        const res = await client.query(
          `
            UPDATE mdata.customers
            SET ${setParts.join(", ")}
            WHERE id = $${idIdx}
            RETURNING
              id,
              customer_name AS name,
              customer_code,
              billing_email AS email,
              billing_phone AS phone,
              billing_address_line1 AS billing_address,
              mc_number,
              dot_number,
              payment_terms_id,
              notes,
              created_at,
              updated_at,
              deactivated_at,
              created_by_user_id,
              updated_by_user_id
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
        await appendCrudAudit(client, authUser.uuid, "mdata.customers.updated", {
          resource_id: updatedRow.id,
          resource_type: "mdata.customers",
          changes,
        });
        return updatedRow;
      });
      if (!updated) return reply.code(404).send({ error: "mdata_customer_not_found" });
      return updated;
    } catch (err) {
      if ((err as { code?: string }).code === "23505") {
        return reply.code(409).send({ error: "mdata_customer_conflict" });
      }
      throw err;
    }
  });

  app.post("/api/v1/mdata/customers/:id/deactivate", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const deactivated = await withCurrentUser(authUser.uuid, async (client) => {
      const oldRes = await client.query(
        `
          SELECT id, deactivated_at
          FROM mdata.customers
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
            UPDATE mdata.customers
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

      await appendCrudAudit(client, authUser.uuid, "mdata.customers.deactivated", {
        resource_id: oldRow.id,
        resource_type: "mdata.customers",
        was_already_deactivated: wasAlreadyDeactivated,
      });

      return { id: oldRow.id, deactivated_at: deactivatedAt, was_already_deactivated: wasAlreadyDeactivated };
    });
    if (!deactivated) return reply.code(404).send({ error: "mdata_customer_not_found" });
    return deactivated;
  });
}
