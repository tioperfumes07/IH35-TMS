/**
 * Profitability routes — W2A-PROFITABILITY-ENGINE (Fastify)
 * One engine, three groupings: By Lane / By Type / By Customer / By Load.
 * NON-FINANCIAL (read-only analytics).
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

const FilterSchema = z.object({
  operating_company_id: z.string().uuid(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  equipment_type: z.enum(["reefer", "dry_van", "flatbed", "step_deck", "other"]).optional(),
  customer_id: z.string().uuid().optional(),
  lane_key: z.string().optional(),
  min_loads: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

const LoadDetailSchema = z.object({
  operating_company_id: z.string().uuid(),
  load_id: z.string().uuid(),
});

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user!;
}

export default async function profitabilityRoutes(fastify: FastifyInstance) {
  // KPI strip summary (for all views)
  fastify.get("/kpi", async (request, reply) => {
    const user = authUser(request, reply);
    if (!user) return;

    const parsed = FilterSchema.pick({ operating_company_id: true, date_from: true, date_to: true, equipment_type: true, customer_id: true, lane_key: true }).safeParse(request.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    const f = parsed.data;

    return withCurrentUser(user.uuid, async (client) => {
      await client.query(`SET LOCAL app.operating_company_id = '${f.operating_company_id}'`);

      let where = `operating_company_id = $1 AND pickup_date BETWEEN $2 AND $3`;
      const params: (string | number)[] = [f.operating_company_id, f.date_from, f.date_to];
      let idx = 4;

      if (f.equipment_type) { where += ` AND equipment_type = $${idx++}`; params.push(f.equipment_type); }
      if (f.customer_id) { where += ` AND customer_id = $${idx++}`; params.push(f.customer_id); }
      if (f.lane_key) { where += ` AND lane_key = $${idx++}`; params.push(f.lane_key); }

      const sql = `
        SELECT 
          count(*) as load_count,
          coalesce(sum(total_miles), 0) as total_miles,
          coalesce(sum(total_revenue), 0) as total_revenue,
          coalesce(sum(total_cost), 0) as total_cost,
          coalesce(sum(margin), 0) as total_margin,
          coalesce(avg(revenue_per_mile), 0) as avg_rev_per_mile,
          coalesce(avg(cost_per_mile), 0) as avg_cost_per_mile,
          coalesce(avg(margin_per_mile), 0) as avg_margin_per_mile,
          bool_or(has_allocated_costs) as has_allocated_costs
        FROM analytics.load_fact
        WHERE ${where}
      `;

      const result = await (client as Queryable).query(sql, params);
      return { kpi: result.rows[0] };
    });
  });

  // GET /profitability/by-lane — the headline view
  fastify.get("/by-lane", async (request, reply) => {
    const user = authUser(request, reply);
    if (!user) return;

    const parsed = FilterSchema.safeParse(request.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    const f = parsed.data;

    return withCurrentUser(user.uuid, async (client) => {
      await client.query(`SET LOCAL app.operating_company_id = '${f.operating_company_id}'`);

      const sql = `
        SELECT 
          lane_key,
          count(*) as loads,
          sum(total_miles) as miles,
          avg(revenue_per_mile) as rev_per_mile,
          avg(cost_per_mile) as cost_per_mile,
          avg(margin_per_mile) as margin_per_mile,
          sum(margin) as total_margin,
          bool_or(has_allocated_costs) as has_allocated_costs
        FROM analytics.load_fact
        WHERE operating_company_id = $1 AND pickup_date BETWEEN $2 AND $3
          ${f.equipment_type ? "AND equipment_type = $4" : ""}
          ${f.customer_id ? f.equipment_type ? "AND customer_id = $5" : "AND customer_id = $4" : ""}
        GROUP BY lane_key
        HAVING count(*) >= ${f.min_loads ?? 1}
        ORDER BY total_margin DESC
        LIMIT $${f.equipment_type && f.customer_id ? 6 : f.equipment_type || f.customer_id ? 5 : 4} 
        OFFSET $${f.equipment_type && f.customer_id ? 7 : f.equipment_type || f.customer_id ? 6 : 5}
      `;

      const params: (string | number)[] = [f.operating_company_id, f.date_from, f.date_to];
      if (f.equipment_type) params.push(f.equipment_type);
      if (f.customer_id) params.push(f.customer_id);
      params.push(f.limit, f.offset);

      const result = await (client as Queryable).query(sql, params);
      return { grouping: "lane", rows: result.rows, count: result.rows.length };
    });
  });

  // GET /profitability/by-type
  fastify.get("/by-type", async (request, reply) => {
    const user = authUser(request, reply);
    if (!user) return;

    const parsed = FilterSchema.safeParse(request.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    const f = parsed.data;

    return withCurrentUser(user.uuid, async (client) => {
      await client.query(`SET LOCAL app.operating_company_id = '${f.operating_company_id}'`);

      const sql = `
        SELECT 
          coalesce(equipment_type, 'unspecified') as equipment_type,
          count(*) as loads,
          sum(total_miles) as miles,
          avg(revenue_per_mile) as rev_per_mile,
          avg(cost_per_mile) as cost_per_mile,
          avg(margin_per_mile) as margin_per_mile,
          sum(margin) as total_margin,
          bool_or(has_allocated_costs) as has_allocated_costs
        FROM analytics.load_fact
        WHERE operating_company_id = $1 AND pickup_date BETWEEN $2 AND $3
          ${f.customer_id ? "AND customer_id = $4" : ""}
          ${f.lane_key ? f.customer_id ? "AND lane_key = $5" : "AND lane_key = $4" : ""}
        GROUP BY equipment_type
        ORDER BY total_margin DESC
      `;

      const params: (string | number)[] = [f.operating_company_id, f.date_from, f.date_to];
      if (f.customer_id) params.push(f.customer_id);
      if (f.lane_key) params.push(f.lane_key);

      const result = await (client as Queryable).query(sql, params);
      return { grouping: "type", rows: result.rows, count: result.rows.length };
    });
  });

  // GET /profitability/by-customer
  fastify.get("/by-customer", async (request, reply) => {
    const user = authUser(request, reply);
    if (!user) return;

    const parsed = FilterSchema.safeParse(request.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    const f = parsed.data;

    return withCurrentUser(user.uuid, async (client) => {
      await client.query(`SET LOCAL app.operating_company_id = '${f.operating_company_id}'`);

      const sql = `
        SELECT 
          customer_id,
          count(*) as loads,
          sum(total_miles) as miles,
          avg(revenue_per_mile) as rev_per_mile,
          avg(cost_per_mile) as cost_per_mile,
          avg(margin_per_mile) as margin_per_mile,
          sum(margin) as total_margin,
          bool_or(has_allocated_costs) as has_allocated_costs
        FROM analytics.load_fact
        WHERE operating_company_id = $1 AND pickup_date BETWEEN $2 AND $3
          ${f.equipment_type ? "AND equipment_type = $4" : ""}
          ${f.lane_key ? f.equipment_type ? "AND lane_key = $5" : "AND lane_key = $4" : ""}
        GROUP BY customer_id
        HAVING count(*) >= ${f.min_loads ?? 1}
        ORDER BY total_margin DESC
      `;

      const params: (string | number)[] = [f.operating_company_id, f.date_from, f.date_to];
      if (f.equipment_type) params.push(f.equipment_type);
      if (f.lane_key) params.push(f.lane_key);

      const result = await (client as Queryable).query(sql, params);
      return { grouping: "customer", rows: result.rows, count: result.rows.length };
    });
  });

  // GET /profitability/by-load — detail view
  fastify.get("/by-load", async (request, reply) => {
    const user = authUser(request, reply);
    if (!user) return;

    const parsed = FilterSchema.safeParse(request.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    const f = parsed.data;

    return withCurrentUser(user.uuid, async (client) => {
      await client.query(`SET LOCAL app.operating_company_id = '${f.operating_company_id}'`);

      let where = `operating_company_id = $1 AND pickup_date BETWEEN $2 AND $3`;
      const params: (string | number)[] = [f.operating_company_id, f.date_from, f.date_to];
      let idx = 4;

      if (f.equipment_type) { where += ` AND equipment_type = $${idx++}`; params.push(f.equipment_type); }
      if (f.customer_id) { where += ` AND customer_id = $${idx++}`; params.push(f.customer_id); }
      if (f.lane_key) { where += ` AND lane_key = $${idx++}`; params.push(f.lane_key); }

      const countSql = `SELECT count(*) FROM analytics.load_fact WHERE ${where}`;
      const countRes = await (client as Queryable).query(countSql, params);
      const totalCount = parseInt(String(countRes.rows[0]?.count ?? 0), 10);

      const sql = `
        SELECT 
          load_id,
          customer_id,
          equipment_type,
          lane_key,
          origin_city,
          dest_city,
          total_miles,
          total_revenue,
          total_cost,
          margin,
          revenue_per_mile,
          cost_per_mile,
          margin_per_mile,
          has_allocated_costs,
          pickup_date
        FROM analytics.load_fact
        WHERE ${where}
        ORDER BY pickup_date DESC
        LIMIT $${idx++} OFFSET $${idx++}
      `;
      params.push(f.limit, f.offset);

      const result = await (client as Queryable).query(sql, params);
      return { grouping: "load", rows: result.rows, total_count: totalCount, limit: f.limit, offset: f.offset };
    });
  });

  // GET /profitability/load/:id — single load detail
  fastify.get("/load/:id", async (request, reply) => {
    const user = authUser(request, reply);
    if (!user) return;

    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { operating_company_id } = z.object({ operating_company_id: z.string().uuid() }).parse(request.query);

    return withCurrentUser(user.uuid, async (client) => {
      await client.query(`SET LOCAL app.operating_company_id = '${operating_company_id}'`);

      const sql = `
        SELECT 
          f.*,
          c.customer_name
        FROM analytics.load_fact f
        LEFT JOIN mdata.customers c ON c.id = f.customer_id
        WHERE f.load_id = $1 AND f.operating_company_id = $2
      `;
      const result = await (client as Queryable).query(sql, [id, operating_company_id]);

      if (result.rows.length === 0) { reply.status(404); return { error: "Load not found" }; }
      return { load: result.rows[0] };
    });
  });
}
