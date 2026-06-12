import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const ALLOWED_ROLES = ["Owner", "Administrator", "Manager", "Accountant"];

const baseQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

function authGuard(req: Parameters<typeof requireAuth>[0], reply: Parameters<typeof requireAuth>[1]) {
  if (!requireAuth(req, reply)) return false;
  const role = String(req.user?.role ?? "");
  if (!ALLOWED_ROLES.includes(role)) {
    reply.code(403).send({ error: "forbidden" });
    return false;
  }
  return true;
}

function buildDateFilter(from: string | undefined, to: string | undefined, values: unknown[], alias: string) {
  const filters: string[] = [];
  if (from) { values.push(from); filters.push(`${alias}.occurred_at >= $${values.length}::timestamptz`); }
  if (to)   { values.push(to);   filters.push(`${alias}.occurred_at <= $${values.length}::timestamptz`); }
  return filters;
}

export async function registerAuditReportRoutes(app: FastifyInstance) {

  /** Activity by user — who did what, date range */
  app.get("/api/v1/audit/reports/activity-by-user", async (req, reply) => {
    if (!authGuard(req, reply)) return;
    const p = baseQuerySchema.extend({
      actor_user_id: z.string().uuid().optional(),
    }).safeParse(req.query ?? {});
    if (!p.success) return reply.code(400).send({ error: "validation_error", details: p.error.flatten() });
    const d = p.data;
    const values: unknown[] = [d.operating_company_id];
    const filters = [`el.operating_company_id = $1::uuid`, ...buildDateFilter(d.from, d.to, values, "el")];
    if (d.actor_user_id) { values.push(d.actor_user_id); filters.push(`el.actor_user_id = $${values.length}::uuid`); }
    values.push(d.limit); const limPos = values.length;
    values.push(d.offset); const offPos = values.length;
    const sql = `
      SELECT el.actor_user_id::text, u.email AS actor_email, el.event_type, el.subject_type,
             el.subject_id::text, el.occurred_at::text, el.source, count(*) OVER()::int AS total_count
      FROM events.event_log el
      LEFT JOIN identity.users u ON u.id = el.actor_user_id
      WHERE ${filters.join(" AND ")}
      ORDER BY el.occurred_at DESC LIMIT $${limPos} OFFSET $${offPos}`;
    return withCurrentUser(req.user!.uuid, async (client) => {
      await client.query(`SET LOCAL app.operating_company_id = '${d.operating_company_id}'`);
      const res = await client.query(sql, values);
      return { rows: res.rows, total_count: Number(res.rows[0]?.total_count ?? 0), limit: d.limit, offset: d.offset };
    });
  });

  /** Activity by module */
  app.get("/api/v1/audit/reports/activity-by-module", async (req, reply) => {
    if (!authGuard(req, reply)) return;
    const p = baseQuerySchema.extend({
      module: z.string().trim().min(1).max(100).optional(),
    }).safeParse(req.query ?? {});
    if (!p.success) return reply.code(400).send({ error: "validation_error", details: p.error.flatten() });
    const d = p.data;
    const values: unknown[] = [d.operating_company_id];
    const filters = [`el.operating_company_id = $1::uuid`, ...buildDateFilter(d.from, d.to, values, "el")];
    if (d.module) { values.push(`%${d.module}%`); filters.push(`el.event_type ILIKE $${values.length}`); }
    values.push(d.limit); const limPos = values.length;
    values.push(d.offset); const offPos = values.length;
    const sql = `
      SELECT el.event_type, el.subject_type, el.subject_id::text, el.actor_user_id::text,
             u.email AS actor_email, el.occurred_at::text, el.source, count(*) OVER()::int AS total_count
      FROM events.event_log el
      LEFT JOIN identity.users u ON u.id = el.actor_user_id
      WHERE ${filters.join(" AND ")}
      ORDER BY el.occurred_at DESC LIMIT $${limPos} OFFSET $${offPos}`;
    return withCurrentUser(req.user!.uuid, async (client) => {
      await client.query(`SET LOCAL app.operating_company_id = '${d.operating_company_id}'`);
      const res = await client.query(sql, values);
      return { rows: res.rows, total_count: Number(res.rows[0]?.total_count ?? 0), limit: d.limit, offset: d.offset };
    });
  });

  /** Financial change log */
  app.get("/api/v1/audit/reports/financial-change-log", async (req, reply) => {
    if (!authGuard(req, reply)) return;
    const p = baseQuerySchema.safeParse(req.query ?? {});
    if (!p.success) return reply.code(400).send({ error: "validation_error", details: p.error.flatten() });
    const d = p.data;
    const values: unknown[] = [d.operating_company_id];
    const filters = [
      `el.operating_company_id = $1::uuid`,
      `el.event_type ILIKE ANY(ARRAY['%invoice%','%bill%','%payment%','%journal%','%void%','%post%','%revers%'])`,
      ...buildDateFilter(d.from, d.to, values, "el"),
    ];
    values.push(d.limit); const limPos = values.length;
    values.push(d.offset); const offPos = values.length;
    const sql = `
      SELECT el.event_type, el.subject_type, el.subject_id::text, el.actor_user_id::text,
             u.email AS actor_email, el.occurred_at::text, el.payload, el.source,
             count(*) OVER()::int AS total_count
      FROM events.event_log el
      LEFT JOIN identity.users u ON u.id = el.actor_user_id
      WHERE ${filters.join(" AND ")}
      ORDER BY el.occurred_at DESC LIMIT $${limPos} OFFSET $${offPos}`;
    return withCurrentUser(req.user!.uuid, async (client) => {
      await client.query(`SET LOCAL app.operating_company_id = '${d.operating_company_id}'`);
      const res = await client.query(sql, values);
      return { rows: res.rows, total_count: Number(res.rows[0]?.total_count ?? 0), limit: d.limit, offset: d.offset };
    });
  });

  /** Maintenance decision log */
  app.get("/api/v1/audit/reports/maintenance-decision-log", async (req, reply) => {
    if (!authGuard(req, reply)) return;
    const p = baseQuerySchema.safeParse(req.query ?? {});
    if (!p.success) return reply.code(400).send({ error: "validation_error", details: p.error.flatten() });
    const d = p.data;
    const values: unknown[] = [d.operating_company_id];
    const filters = [
      `el.operating_company_id = $1::uuid`,
      `el.event_type ILIKE ANY(ARRAY['%maintenance%','%work_order%','%inspection%','%repair%','%defect%'])`,
      ...buildDateFilter(d.from, d.to, values, "el"),
    ];
    values.push(d.limit); const limPos = values.length;
    values.push(d.offset); const offPos = values.length;
    const sql = `
      SELECT el.event_type, el.subject_type, el.subject_id::text, el.actor_user_id::text,
             u.email AS actor_email, el.occurred_at::text, el.payload, el.source,
             count(*) OVER()::int AS total_count
      FROM events.event_log el
      LEFT JOIN identity.users u ON u.id = el.actor_user_id
      WHERE ${filters.join(" AND ")}
      ORDER BY el.occurred_at DESC LIMIT $${limPos} OFFSET $${offPos}`;
    return withCurrentUser(req.user!.uuid, async (client) => {
      await client.query(`SET LOCAL app.operating_company_id = '${d.operating_company_id}'`);
      const res = await client.query(sql, values);
      return { rows: res.rows, total_count: Number(res.rows[0]?.total_count ?? 0), limit: d.limit, offset: d.offset };
    });
  });

  /** Deduction trail */
  app.get("/api/v1/audit/reports/deduction-trail", async (req, reply) => {
    if (!authGuard(req, reply)) return;
    const p = baseQuerySchema.extend({
      driver_id: z.string().uuid().optional(),
    }).safeParse(req.query ?? {});
    if (!p.success) return reply.code(400).send({ error: "validation_error", details: p.error.flatten() });
    const d = p.data;
    const values: unknown[] = [d.operating_company_id];
    const filters = [
      `el.operating_company_id = $1::uuid`,
      `el.event_type ILIKE ANY(ARRAY['%deduction%','%fine%','%accident_cost%','%chargeback%'])`,
      ...buildDateFilter(d.from, d.to, values, "el"),
    ];
    if (d.driver_id) { values.push(d.driver_id); filters.push(`el.subject_id = $${values.length}::uuid`); }
    values.push(d.limit); const limPos = values.length;
    values.push(d.offset); const offPos = values.length;
    const sql = `
      SELECT el.event_type, el.subject_type, el.subject_id::text, el.actor_user_id::text,
             u.email AS actor_email, el.occurred_at::text, el.payload, el.source,
             count(*) OVER()::int AS total_count
      FROM events.event_log el
      LEFT JOIN identity.users u ON u.id = el.actor_user_id
      WHERE ${filters.join(" AND ")}
      ORDER BY el.occurred_at DESC LIMIT $${limPos} OFFSET $${offPos}`;
    return withCurrentUser(req.user!.uuid, async (client) => {
      await client.query(`SET LOCAL app.operating_company_id = '${d.operating_company_id}'`);
      const res = await client.query(sql, values);
      return { rows: res.rows, total_count: Number(res.rows[0]?.total_count ?? 0), limit: d.limit, offset: d.offset };
    });
  });

  /** Void & reversal report */
  app.get("/api/v1/audit/reports/void-reversal", async (req, reply) => {
    if (!authGuard(req, reply)) return;
    const p = baseQuerySchema.safeParse(req.query ?? {});
    if (!p.success) return reply.code(400).send({ error: "validation_error", details: p.error.flatten() });
    const d = p.data;
    const values: unknown[] = [d.operating_company_id];
    const filters = [
      `el.operating_company_id = $1::uuid`,
      `el.event_type ILIKE ANY(ARRAY['%void%','%revers%','%cancel%'])`,
      ...buildDateFilter(d.from, d.to, values, "el"),
    ];
    values.push(d.limit); const limPos = values.length;
    values.push(d.offset); const offPos = values.length;
    const sql = `
      SELECT el.event_type, el.subject_type, el.subject_id::text, el.actor_user_id::text,
             u.email AS actor_email, el.occurred_at::text, el.payload, el.source,
             count(*) OVER()::int AS total_count
      FROM events.event_log el
      LEFT JOIN identity.users u ON u.id = el.actor_user_id
      WHERE ${filters.join(" AND ")}
      ORDER BY el.occurred_at DESC LIMIT $${limPos} OFFSET $${offPos}`;
    return withCurrentUser(req.user!.uuid, async (client) => {
      await client.query(`SET LOCAL app.operating_company_id = '${d.operating_company_id}'`);
      const res = await client.query(sql, values);
      return { rows: res.rows, total_count: Number(res.rows[0]?.total_count ?? 0), limit: d.limit, offset: d.offset };
    });
  });

  /** Period close history */
  app.get("/api/v1/audit/reports/period-close-history", async (req, reply) => {
    if (!authGuard(req, reply)) return;
    const p = baseQuerySchema.safeParse(req.query ?? {});
    if (!p.success) return reply.code(400).send({ error: "validation_error", details: p.error.flatten() });
    const d = p.data;
    const values: unknown[] = [d.operating_company_id];
    const filters = [
      `el.operating_company_id = $1::uuid`,
      `el.event_type ILIKE ANY(ARRAY['%period%close%','%period%open%','%period%reopen%','%accounting_period%'])`,
      ...buildDateFilter(d.from, d.to, values, "el"),
    ];
    values.push(d.limit); const limPos = values.length;
    values.push(d.offset); const offPos = values.length;
    const sql = `
      SELECT el.event_type, el.subject_type, el.subject_id::text, el.actor_user_id::text,
             u.email AS actor_email, el.occurred_at::text, el.payload, el.source,
             count(*) OVER()::int AS total_count
      FROM events.event_log el
      LEFT JOIN identity.users u ON u.id = el.actor_user_id
      WHERE ${filters.join(" AND ")}
      ORDER BY el.occurred_at DESC LIMIT $${limPos} OFFSET $${offPos}`;
    return withCurrentUser(req.user!.uuid, async (client) => {
      await client.query(`SET LOCAL app.operating_company_id = '${d.operating_company_id}'`);
      const res = await client.query(sql, values);
      return { rows: res.rows, total_count: Number(res.rows[0]?.total_count ?? 0), limit: d.limit, offset: d.offset };
    });
  });
}
