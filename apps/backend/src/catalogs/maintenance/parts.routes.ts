/**
 * CLOSURE-10 — Enhanced maintenance parts master catalog routes.
 * Route: GET /api/v1/catalogs/maintenance/parts-master
 * Table: mdata.maintenance_parts (NOT catalogs.maintenance_parts)
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";

const CATEGORY_VALUES = [
  "engine","transmission","brake","tire","suspension",
  "electrical","fuel_system","cooling","exhaust","cabin",
  "reefer","body","fluid","filter","other",
] as const;

const listQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  search: z.string().trim().max(200).optional(),
  manufacturer: z.string().trim().max(120).optional(),
  category: z.enum(CATEGORY_VALUES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const idParamSchema = z.object({ id: z.string().uuid() });

const createSchema = z.object({
  operating_company_id: z.string().uuid(),
  sku: z.string().trim().min(1).max(120),
  part_name: z.string().trim().min(1).max(250),
  manufacturer: z.string().trim().min(1).max(120),
  model_compatibility: z.array(z.string().trim().max(80)).default([]),
  category: z.enum(CATEGORY_VALUES),
  sub_category: z.string().trim().max(120).optional(),
  typical_unit_cost_cents: z.number().int().nonnegative().default(0),
  barcode_upc: z.string().trim().max(50).optional(),
  is_active: z.boolean().default(true),
});

const updateSchema = z.object({
  part_name: z.string().trim().min(1).max(250).optional(),
  manufacturer: z.string().trim().max(120).optional(),
  model_compatibility: z.array(z.string().trim().max(80)).optional(),
  category: z.enum(CATEGORY_VALUES).optional(),
  sub_category: z.string().trim().max(120).nullable().optional(),
  typical_unit_cost_cents: z.number().int().nonnegative().optional(),
  barcode_upc: z.string().trim().max(50).nullable().optional(),
  is_active: z.boolean().optional(),
}).refine((v) => Object.keys(v).length > 0, { message: "at least one field required" });

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

async function withCompany<T>(userId: string, companyId: string, fn: (client: { query: <R = Record<string, unknown>>(sql: string, vals?: unknown[]) => Promise<{ rows: R[] }> }) => Promise<T>) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${companyId}'`);
    return fn(client as Parameters<typeof fn>[0]);
  });
}

// The parts-MASTER table this route was built against (mdata.maintenance_parts, with sku/manufacturer/
// category/barcode/model_compatibility) does NOT exist on prod, and NO existing table matches its shape:
// catalogs.parts lacks 7 of 9 columns; maintenance.parts_inventory is a stock table (on_hand_qty/last_
// purchase_*). Resolving this is a Jorge data-model decision (canonical parts master vs. the ~6 stub
// tables) — see memory bucket3-phantom-schema-disposition. Until then, degrade gracefully instead of
// 42P01'ing every request: guard on to_regclass and report the feature as unprovisioned.
async function partsMasterTableExists(client: {
  query: <R = Record<string, unknown>>(sql: string, vals?: unknown[]) => Promise<{ rows: R[] }>;
}): Promise<boolean> {
  const r = await client.query<{ ok: boolean }>(`SELECT to_regclass('mdata.maintenance_parts') IS NOT NULL AS ok`);
  return Boolean(r.rows[0]?.ok);
}

export async function registerMaintenancePartsMasterRoutes(app: FastifyInstance) {
  app.get("/api/v1/catalogs/maintenance/parts-master", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const parsed = listQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    const q = parsed.data;
    const offset = (q.page - 1) * q.limit;

    return withCompany(user.uuid, q.operating_company_id, async (client) => {
      if (!(await partsMasterTableExists(client))) return { rows: [], total: 0, page: q.page, limit: q.limit };
      const values: unknown[] = [q.operating_company_id];
      const where = ["operating_company_id = $1"];
      if (q.search) { values.push(`%${q.search}%`); where.push(`(sku ILIKE $${values.length} OR part_name ILIKE $${values.length} OR barcode_upc ILIKE $${values.length})`); }
      if (q.manufacturer) { values.push(q.manufacturer); where.push(`manufacturer ILIKE $${values.length}`); }
      if (q.category) { values.push(q.category); where.push(`category = $${values.length}`); }

      const countRes = await client.query<{ total: string }>(`SELECT count(*)::text AS total FROM mdata.maintenance_parts WHERE ${where.join(" AND ")}`, values);
      values.push(q.limit, offset);
      const rowsRes = await client.query(
        `SELECT id, sku, part_name, manufacturer, model_compatibility, category, sub_category, typical_unit_cost_cents, barcode_upc, is_active, created_at FROM mdata.maintenance_parts WHERE ${where.join(" AND ")} ORDER BY manufacturer ASC, part_name ASC LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values
      );
      return { rows: rowsRes.rows, total: Number((countRes.rows[0] as { total?: string } | undefined)?.total ?? 0), page: q.page, limit: q.limit };
    });
  });

  app.post("/api/v1/catalogs/maintenance/parts-master", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    if (!["Owner", "Administrator", "Manager", "Mechanic"].includes(user.role)) return reply.code(403).send({ error: "forbidden" });
    const body = createSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });
    const d = body.data;
    const created = await withCompany(user.uuid, d.operating_company_id, async (client) => {
      if (!(await partsMasterTableExists(client))) return null;
      const res = await client.query(
        `INSERT INTO mdata.maintenance_parts (operating_company_id, sku, part_name, manufacturer, model_compatibility, category, sub_category, typical_unit_cost_cents, barcode_upc, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [d.operating_company_id, d.sku, d.part_name, d.manufacturer, d.model_compatibility, d.category, d.sub_category ?? null, d.typical_unit_cost_cents, d.barcode_upc ?? null, d.is_active]
      );
      return res.rows[0];
    });
    if (!created) return reply.code(503).send({ error: "parts_master_not_provisioned" });
    return reply.code(201).send(created);
  });

  app.patch("/api/v1/catalogs/maintenance/parts-master/:id", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    if (!["Owner", "Administrator", "Manager", "Mechanic"].includes(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "invalid_id" });
    const body = updateSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });
    const companyQ = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query ?? {});
    if (!companyQ.success) return reply.code(400).send({ error: "missing operating_company_id" });

    const updated = await withCompany(user.uuid, companyQ.data.operating_company_id, async (client) => {
      if (!(await partsMasterTableExists(client))) return null;
      const d = body.data;
      const setClauses: string[] = [];
      const vals: unknown[] = [];
      if (d.part_name !== undefined) { vals.push(d.part_name); setClauses.push(`part_name = $${vals.length}`); }
      if (d.manufacturer !== undefined) { vals.push(d.manufacturer); setClauses.push(`manufacturer = $${vals.length}`); }
      if (d.category !== undefined) { vals.push(d.category); setClauses.push(`category = $${vals.length}`); }
      if (d.typical_unit_cost_cents !== undefined) { vals.push(d.typical_unit_cost_cents); setClauses.push(`typical_unit_cost_cents = $${vals.length}`); }
      if (d.is_active !== undefined) { vals.push(d.is_active); setClauses.push(`is_active = $${vals.length}`); }
      if (setClauses.length === 0) return null;
      vals.push(params.data.id);
      const res = await client.query(`UPDATE mdata.maintenance_parts SET ${setClauses.join(", ")}, updated_at = now() WHERE id = $${vals.length} RETURNING *`, vals);
      return res.rows[0] ?? null;
    });
    if (!updated) return reply.code(404).send({ error: "not_found" });
    return updated;
  });
}
