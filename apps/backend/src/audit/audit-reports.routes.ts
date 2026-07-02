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
      await client.query("SELECT set_config('app.operating_company_id', $1, true)", [d.operating_company_id]);
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
      await client.query("SELECT set_config('app.operating_company_id', $1, true)", [d.operating_company_id]);
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
      await client.query("SELECT set_config('app.operating_company_id', $1, true)", [d.operating_company_id]);
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
      await client.query("SELECT set_config('app.operating_company_id', $1, true)", [d.operating_company_id]);
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
      await client.query("SELECT set_config('app.operating_company_id', $1, true)", [d.operating_company_id]);
      const res = await client.query(sql, values);
      return { rows: res.rows, total_count: Number(res.rows[0]?.total_count ?? 0), limit: d.limit, offset: d.offset };
    });
  });

  /** Void & reversal report.
   *  UNIONs TWO audit sinks so the register is COMPLETE:
   *    1. events.event_log — domain/period void+cancel events (subject-scoped, opco column).
   *    2. audit.audit_events — the immutable spine that appendCrudAudit/auditVoid write to (invoice/bill/
   *       expense/JE/WO voids + GL reversals). The original report read ONLY (1) and silently MISSED every
   *       void written via appendCrudAudit. audit.audit_events has NO operating_company_id/occurred_at
   *       column: opco lives in payload (inconsistently present) and the timestamp is created_at — so scope
   *       it by payload opco WHEN PRESENT and include rows that carry NO opco (void/reversal events often
   *       omit it) so nothing is dropped. Read-only; output shape unchanged (adds provenance audit_source). */
  app.get("/api/v1/audit/reports/void-reversal", async (req, reply) => {
    if (!authGuard(req, reply)) return;
    const p = baseQuerySchema.safeParse(req.query ?? {});
    if (!p.success) return reply.code(400).send({ error: "validation_error", details: p.error.flatten() });
    const d = p.data;
    const values: unknown[] = [d.operating_company_id];
    let fromPos = 0;
    let toPos = 0;
    if (d.from) { values.push(d.from); fromPos = values.length; }
    if (d.to) { values.push(d.to); toPos = values.length; }
    values.push(d.limit); const limPos = values.length;
    values.push(d.offset); const offPos = values.length;

    const elDate = [
      ...(fromPos ? [`el.occurred_at >= $${fromPos}::timestamptz`] : []),
      ...(toPos ? [`el.occurred_at <= $${toPos}::timestamptz`] : []),
    ].join(" AND ");
    const aeDate = [
      ...(fromPos ? [`ae.created_at >= $${fromPos}::timestamptz`] : []),
      ...(toPos ? [`ae.created_at <= $${toPos}::timestamptz`] : []),
    ].join(" AND ");

    const sql = `
      WITH combined AS (
        SELECT el.event_type, el.subject_type, el.subject_id::text AS subject_id,
               el.actor_user_id::text AS actor_user_id, el.occurred_at AS occurred_at,
               el.payload, el.source, 'events.event_log'::text AS audit_source
        FROM events.event_log el
        WHERE el.operating_company_id = $1::uuid
          AND el.event_type ILIKE ANY(ARRAY['%void%','%revers%','%cancel%'])
          ${elDate ? `AND ${elDate}` : ""}
        UNION ALL
        SELECT ae.event_class AS event_type,
               (ae.payload->>'resource_type') AS subject_type,
               COALESCE(ae.payload->>'resource_id', ae.payload->>'reversed_entity_id',
                        ae.payload->>'expense_id', ae.payload->>'entity_id') AS subject_id,
               ae.actor_user_uuid::text AS actor_user_id, ae.created_at AS occurred_at,
               ae.payload, ae.source, 'audit.audit_events'::text AS audit_source
        FROM audit.audit_events ae
        WHERE ae.event_class ILIKE ANY(ARRAY['%void%','%revers%','%cancel%'])
          AND COALESCE(ae.payload->>'operating_company_id', '') IN ('', $1::text)
          ${aeDate ? `AND ${aeDate}` : ""}
      )
      SELECT c.event_type, c.subject_type, c.subject_id, c.actor_user_id,
             u.email AS actor_email, c.occurred_at::text AS occurred_at, c.payload, c.source,
             c.audit_source, count(*) OVER()::int AS total_count
      FROM combined c
      LEFT JOIN identity.users u ON u.id = c.actor_user_id::uuid
      ORDER BY c.occurred_at DESC
      LIMIT $${limPos} OFFSET $${offPos}`;
    return withCurrentUser(req.user!.uuid, async (client) => {
      await client.query("SELECT set_config('app.operating_company_id', $1, true)", [d.operating_company_id]);
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
      await client.query("SELECT set_config('app.operating_company_id', $1, true)", [d.operating_company_id]);
      const res = await client.query(sql, values);
      return { rows: res.rows, total_count: Number(res.rows[0]?.total_count ?? 0), limit: d.limit, offset: d.offset };
    });
  });
}
