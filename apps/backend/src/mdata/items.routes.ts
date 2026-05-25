import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().trim().min(1).max(100).optional(),
  active: z.coerce.boolean().optional(),
  operating_company_id: z.string().uuid().optional(),
});

const idParamSchema = z.object({ id: z.string().uuid() });

const patchBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    sku: z.string().trim().max(120).nullable().optional(),
    item_type: z.string().trim().max(64).nullable().optional(),
    unit_price_cents: z.number().int().min(0).nullable().optional(),
    active: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "at least one field is required" });

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

async function resolveOperatingCompanyId(
  client: { query: (sql: string, values: unknown[]) => Promise<{ rows: Array<{ id: string }> }> },
  requested?: string
): Promise<string | null> {
  if (requested) return requested;
  const res = await client.query(
    `
      SELECT c.id
      FROM org.companies c
      WHERE c.id IN (SELECT org.user_accessible_company_ids())
        AND c.deactivated_at IS NULL
      ORDER BY c.id
      LIMIT 1
    `,
    []
  );
  return res.rows[0]?.id ?? null;
}

export async function registerMdataItemsRoutes(app: FastifyInstance) {
  app.get("/api/v1/mdata/items", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedQuery = listQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);
    const { limit, offset, search, active, operating_company_id } = parsedQuery.data;

    const rows = await withCurrentUser(authUser.uuid, async (client) => {
      const resolvedOperatingCompanyId = await resolveOperatingCompanyId(client, operating_company_id);
      if (!resolvedOperatingCompanyId) return null;
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [resolvedOperatingCompanyId]);

      const values: unknown[] = [resolvedOperatingCompanyId];
      const filters = ["operating_company_id = $1::uuid"];
      if (typeof active === "boolean") {
        values.push(active);
        filters.push(`active = $${values.length}`);
      }
      if (search) {
        values.push(`%${search}%`);
        const idx = values.length;
        filters.push(`(name ILIKE $${idx} OR COALESCE(sku, '') ILIKE $${idx})`);
      }
      values.push(limit, offset);
      const whereClause = `WHERE ${filters.join(" AND ")}`;
      const res = await client.query(
        `
          SELECT id, operating_company_id, qbo_id, name, sku, item_type, unit_price_cents, active, mirrored_at, created_at, updated_at
          FROM mdata.qbo_items
          ${whereClause}
          ORDER BY updated_at DESC
          LIMIT $${values.length - 1}
          OFFSET $${values.length}
        `,
        values
      );
      return res.rows;
    });

    if (!rows) return reply.code(400).send({ error: "operating_company_id_required" });
    return { items: rows };
  });

  app.get("/api/v1/mdata/items/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedQuery = z.object({ operating_company_id: z.string().uuid().optional() }).safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

    const row = await withCurrentUser(authUser.uuid, async (client) => {
      const resolvedOperatingCompanyId = await resolveOperatingCompanyId(client, parsedQuery.data.operating_company_id);
      if (!resolvedOperatingCompanyId) return null;
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [resolvedOperatingCompanyId]);
      const res = await client.query(
        `
          SELECT id, operating_company_id, qbo_id, name, sku, item_type, unit_price_cents, active, mirrored_at, created_at, updated_at
          FROM mdata.qbo_items
          WHERE id = $1::uuid
            AND operating_company_id = $2::uuid
          LIMIT 1
        `,
        [parsedParams.data.id, resolvedOperatingCompanyId]
      );
      return res.rows[0] ?? null;
    });

    if (!row) return reply.code(404).send({ error: "mdata_item_not_found" });
    return row;
  });

  app.patch("/api/v1/mdata/items/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = patchBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const parsedQuery = z.object({ operating_company_id: z.string().uuid().optional() }).safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);
    const body = parsedBody.data;

    const setParts: string[] = [];
    const values: unknown[] = [];
    const add = (column: string, value: unknown) => {
      values.push(value);
      setParts.push(`${column} = $${values.length}`);
    };
    if ("name" in body) add("name", body.name ?? null);
    if ("sku" in body) add("sku", body.sku ?? null);
    if ("item_type" in body) add("item_type", body.item_type ?? null);
    if ("unit_price_cents" in body) add("unit_price_cents", body.unit_price_cents ?? null);
    if ("active" in body) add("active", body.active ?? null);
    setParts.push("mirrored_at = now()");
    setParts.push("updated_at = now()");

    const updated = await withCurrentUser(authUser.uuid, async (client) => {
      const resolvedOperatingCompanyId = await resolveOperatingCompanyId(client, parsedQuery.data.operating_company_id);
      if (!resolvedOperatingCompanyId) return null;
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [resolvedOperatingCompanyId]);
      values.push(parsedParams.data.id, resolvedOperatingCompanyId);
      const res = await client.query(
        `
          UPDATE mdata.qbo_items
          SET ${setParts.join(", ")}
          WHERE id = $${values.length - 1}::uuid
            AND operating_company_id = $${values.length}::uuid
          RETURNING id, operating_company_id, qbo_id, name, sku, item_type, unit_price_cents, active, mirrored_at, created_at, updated_at
        `,
        values
      );
      return res.rows[0] ?? null;
    });

    if (!updated) return reply.code(404).send({ error: "mdata_item_not_found" });
    return updated;
  });
}
