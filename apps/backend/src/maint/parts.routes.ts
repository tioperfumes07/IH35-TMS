import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  search: z.string().trim().optional(),
});

const idParamsSchema = z.object({ id: z.string().uuid() });

const createPartSchema = z.object({
  operating_company_id: z.string().uuid(),
  sku: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(250),
  category: z.string().trim().max(120).optional(),
  unit_cost_cents: z.number().int().nonnegative().default(0),
  qty_on_hand: z.number().int().nonnegative().default(0),
  reorder_point: z.number().int().nonnegative().default(0),
});

const updatePartSchema = z
  .object({
    sku: z.string().trim().min(1).max(120).optional(),
    name: z.string().trim().min(1).max(250).optional(),
    category: z.string().trim().max(120).nullable().optional(),
    unit_cost_cents: z.number().int().nonnegative().optional(),
    qty_on_hand: z.number().int().nonnegative().optional(),
    reorder_point: z.number().int().nonnegative().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "at least one field is required" });

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function canMutate(role: string) {
  return ["Owner", "Administrator", "Manager", "Mechanic"].includes(role);
}

async function withCompanyScope<T>(
  userId: string,
  operatingCompanyId: string,
  fn: (client: Queryable) => Promise<T>
) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${operatingCompanyId}'`);
    return fn(client as Queryable);
  });
}

export async function registerMaintPartsRoutes(app: FastifyInstance) {
  app.get("/api/v1/maint/parts", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });

    const rows = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
      const values: unknown[] = [parsed.data.operating_company_id];
      const filters = ["tenant_id = $1::uuid"];
      if (parsed.data.search) {
        values.push(`%${parsed.data.search}%`);
        const idx = values.length;
        filters.push(`(sku ILIKE $${idx} OR name ILIKE $${idx})`);
      }
      const result = await client.query(
        `
          SELECT
            id::text,
            sku,
            name,
            category,
            unit_cost_cents::int,
            qty_on_hand::int,
            reorder_point::int,
            (qty_on_hand <= reorder_point) AS needs_reorder,
            created_at::text,
            updated_at::text
          FROM maint.part
          WHERE ${filters.join(" AND ")}
          ORDER BY name ASC, sku ASC
        `,
        values
      );
      return result.rows;
    });

    return { rows };
  });

  app.post("/api/v1/maint/parts", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const parsed = createPartSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    const body = parsed.data;

    const created = await withCompanyScope(user.uuid, body.operating_company_id, async (client) => {
      const result = await client.query(
        `
          INSERT INTO maint.part (
            tenant_id, sku, name, category, unit_cost_cents, qty_on_hand, reorder_point
          )
          VALUES ($1::uuid, $2, $3, $4, $5, $6, $7)
          RETURNING
            id::text,
            sku,
            name,
            category,
            unit_cost_cents::int,
            qty_on_hand::int,
            reorder_point::int
        `,
        [
          body.operating_company_id,
          body.sku,
          body.name,
          body.category ?? null,
          body.unit_cost_cents,
          body.qty_on_hand,
          body.reorder_point,
        ]
      );
      await appendCrudAudit(client, user.uuid, "maint.part.created", {
        resource_id: result.rows[0]?.id,
        operating_company_id: body.operating_company_id,
      });
      return result.rows[0];
    });

    return reply.code(201).send(created);
  });

  app.patch("/api/v1/maint/parts/:id", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const query = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    const bodyParsed = updatePartSchema.safeParse(req.body ?? {});
    if (!bodyParsed.success) return reply.code(400).send({ error: "validation_error", details: bodyParsed.error.flatten() });
    const body = bodyParsed.data;

    const updated = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const assignments: string[] = [];
      const values: unknown[] = [query.data.operating_company_id, params.data.id];
      const setField = (column: string, value: unknown) => {
        values.push(value);
        assignments.push(`${column} = $${values.length}`);
      };
      if (body.sku !== undefined) setField("sku", body.sku);
      if (body.name !== undefined) setField("name", body.name);
      if (body.category !== undefined) setField("category", body.category);
      if (body.unit_cost_cents !== undefined) setField("unit_cost_cents", body.unit_cost_cents);
      if (body.qty_on_hand !== undefined) setField("qty_on_hand", body.qty_on_hand);
      if (body.reorder_point !== undefined) setField("reorder_point", body.reorder_point);

      const result = await client.query(
        `
          UPDATE maint.part
          SET ${assignments.join(", ")}
          WHERE tenant_id = $1::uuid AND id = $2::uuid
          RETURNING
            id::text,
            sku,
            name,
            category,
            unit_cost_cents::int,
            qty_on_hand::int,
            reorder_point::int
        `,
        values
      );
      if (!result.rows[0]) return null;
      await appendCrudAudit(client, user.uuid, "maint.part.updated", {
        resource_id: params.data.id,
        operating_company_id: query.data.operating_company_id,
      });
      return result.rows[0];
    });

    if (!updated) return reply.code(404).send({ error: "part_not_found" });
    return updated;
  });
}
