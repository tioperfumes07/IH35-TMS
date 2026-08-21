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

// Reports audit leaves must resolve the same immutable subject identity as System Audit. Keep the
// projection and company-safe joins centralized so seven sibling endpoints cannot drift back to
// raw UUID labels independently.
function auditSubjectProjection(alias: string) {
  return `
    CASE
      WHEN ${alias}.subject_type = 'task' AND ${alias}.source_table = 'maintenance.work_orders' THEN 'work_order'
      WHEN ${alias}.subject_type = 'task' AND ${alias}.source_table = 'accounting.invoices' THEN 'invoice'
      WHEN ${alias}.subject_type = 'task' AND ${alias}.source_table = 'accounting.bills' THEN 'bill'
      ELSE ${alias}.subject_type
    END AS subject_kind,
    CASE
      WHEN ${alias}.subject_type = 'load' THEN NULLIF(TRIM(audit_load.load_number), '')
      WHEN ${alias}.subject_type = 'driver' THEN NULLIF(TRIM(CONCAT_WS(' ', audit_driver.first_name, audit_driver.last_name)), '')
      WHEN ${alias}.subject_type = 'unit' THEN NULLIF(TRIM(audit_unit.unit_number), '')
      WHEN ${alias}.subject_type = 'customer' THEN NULLIF(TRIM(audit_customer.customer_name), '')
      WHEN ${alias}.subject_type = 'vendor' THEN NULLIF(TRIM(audit_vendor.vendor_name), '')
      WHEN ${alias}.subject_type = 'invoice' THEN NULLIF(TRIM(audit_invoice.display_id), '')
      WHEN ${alias}.subject_type = 'bill' THEN NULLIF(TRIM(COALESCE(audit_bill.display_id, audit_bill.bill_number)), '')
      WHEN ${alias}.subject_type = 'journal_entry' THEN NULLIF(TRIM(audit_je.memo), '')
      WHEN ${alias}.subject_type = 'customer_payment' THEN NULLIF(TRIM(audit_customer_payment.display_id), '')
      WHEN ${alias}.subject_type = 'prepaid_purchase' THEN NULLIF(TRIM(COALESCE(audit_prepaid.asset_number, audit_prepaid.description)), '')
      WHEN ${alias}.subject_type = 'task' THEN CASE ${alias}.source_table
        WHEN 'maintenance.work_orders' THEN NULLIF(TRIM(audit_wo.display_id), '')
        WHEN 'accounting.invoices' THEN NULLIF(TRIM(audit_invoice.display_id), '')
        WHEN 'accounting.bills' THEN NULLIF(TRIM(COALESCE(audit_bill.display_id, audit_bill.bill_number)), '')
        ELSE NULL
      END
      ELSE NULL
    END AS subject_label`;
}

function auditSubjectJoins(alias: string) {
  return `
    LEFT JOIN mdata.loads audit_load
      ON ${alias}.subject_type = 'load'
     AND audit_load.id = ${alias}.subject_id
     AND audit_load.operating_company_id = ${alias}.operating_company_id
    LEFT JOIN mdata.drivers audit_driver
      ON ${alias}.subject_type = 'driver'
     AND audit_driver.id = ${alias}.subject_id
     AND audit_driver.operating_company_id = ${alias}.operating_company_id
    LEFT JOIN mdata.units audit_unit
      ON ${alias}.subject_type = 'unit'
     AND audit_unit.id = ${alias}.subject_id
     AND COALESCE(audit_unit.currently_leased_to_company_id, audit_unit.owner_company_id) = ${alias}.operating_company_id
    LEFT JOIN mdata.customers audit_customer
      ON ${alias}.subject_type = 'customer'
     AND audit_customer.id = ${alias}.subject_id
     AND audit_customer.operating_company_id = ${alias}.operating_company_id
    LEFT JOIN mdata.vendors audit_vendor
      ON ${alias}.subject_type = 'vendor'
     AND audit_vendor.id = ${alias}.subject_id
     AND audit_vendor.operating_company_id = ${alias}.operating_company_id
    LEFT JOIN maintenance.work_orders audit_wo
      ON ${alias}.subject_type = 'task'
     AND ${alias}.source_table = 'maintenance.work_orders'
     AND audit_wo.id = ${alias}.source_reference_id
     AND audit_wo.operating_company_id = ${alias}.operating_company_id
    LEFT JOIN accounting.invoices audit_invoice
      ON (( ${alias}.subject_type = 'invoice' AND audit_invoice.id = ${alias}.subject_id )
       OR ( ${alias}.subject_type = 'task' AND ${alias}.source_table = 'accounting.invoices'
            AND audit_invoice.id = ${alias}.source_reference_id ))
     AND audit_invoice.operating_company_id = ${alias}.operating_company_id
    LEFT JOIN accounting.bills audit_bill
      ON (( ${alias}.subject_type = 'bill' AND audit_bill.id = ${alias}.subject_id )
       OR ( ${alias}.subject_type = 'task' AND ${alias}.source_table = 'accounting.bills'
            AND audit_bill.id = ${alias}.source_reference_id ))
     AND audit_bill.operating_company_id = ${alias}.operating_company_id
    LEFT JOIN accounting.journal_entries audit_je
      ON ${alias}.subject_type = 'journal_entry'
     AND audit_je.id = ${alias}.subject_id
     AND audit_je.operating_company_id = ${alias}.operating_company_id
    LEFT JOIN accounting.payments audit_customer_payment
      ON ${alias}.subject_type = 'customer_payment'
     AND audit_customer_payment.id = ${alias}.subject_id
     AND audit_customer_payment.operating_company_id = ${alias}.operating_company_id
    LEFT JOIN accounting.prepaid_assets audit_prepaid
      ON ${alias}.subject_type = 'prepaid_purchase'
     AND audit_prepaid.id = ${alias}.subject_id
     AND audit_prepaid.operating_company_id = ${alias}.operating_company_id`;
}

export async function registerAuditReportRoutes(app: FastifyInstance) {

  /** Activity by user — who did what, date range */
  app.get("/api/v1/audit/reports/activity-by-user", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
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
             el.subject_id::text, ${auditSubjectProjection("el")},
             el.occurred_at::text, el.source, count(*) OVER()::int AS total_count
      FROM events.event_log el
      LEFT JOIN identity.users u ON u.id = el.actor_user_id
      ${auditSubjectJoins("el")}
      WHERE ${filters.join(" AND ")}
      ORDER BY el.occurred_at DESC LIMIT $${limPos} OFFSET $${offPos}`;
    return withCurrentUser(req.user!.uuid, async (client) => {
      await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [d.operating_company_id]);
      const res = await client.query(sql, values);
      return { rows: res.rows, total_count: Number(res.rows[0]?.total_count ?? 0), limit: d.limit, offset: d.offset };
    });
  });

  /** Activity by module */
  app.get("/api/v1/audit/reports/activity-by-module", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
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
      SELECT el.event_type, el.subject_type, el.subject_id::text, ${auditSubjectProjection("el")}, el.actor_user_id::text,
             u.email AS actor_email, el.occurred_at::text, el.source, count(*) OVER()::int AS total_count
      FROM events.event_log el
      LEFT JOIN identity.users u ON u.id = el.actor_user_id
      ${auditSubjectJoins("el")}
      WHERE ${filters.join(" AND ")}
      ORDER BY el.occurred_at DESC LIMIT $${limPos} OFFSET $${offPos}`;
    return withCurrentUser(req.user!.uuid, async (client) => {
      await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [d.operating_company_id]);
      const res = await client.query(sql, values);
      return { rows: res.rows, total_count: Number(res.rows[0]?.total_count ?? 0), limit: d.limit, offset: d.offset };
    });
  });

  /** Financial change log */
  app.get("/api/v1/audit/reports/financial-change-log", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
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
      SELECT el.event_type, el.subject_type, el.subject_id::text, ${auditSubjectProjection("el")}, el.actor_user_id::text,
             u.email AS actor_email, el.occurred_at::text, el.payload, el.source,
             count(*) OVER()::int AS total_count
      FROM events.event_log el
      LEFT JOIN identity.users u ON u.id = el.actor_user_id
      ${auditSubjectJoins("el")}
      WHERE ${filters.join(" AND ")}
      ORDER BY el.occurred_at DESC LIMIT $${limPos} OFFSET $${offPos}`;
    return withCurrentUser(req.user!.uuid, async (client) => {
      await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [d.operating_company_id]);
      const res = await client.query(sql, values);
      return { rows: res.rows, total_count: Number(res.rows[0]?.total_count ?? 0), limit: d.limit, offset: d.offset };
    });
  });

  /** Maintenance decision log */
  app.get("/api/v1/audit/reports/maintenance-decision-log", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
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
      SELECT el.event_type, el.subject_type, el.subject_id::text, ${auditSubjectProjection("el")}, el.actor_user_id::text,
             u.email AS actor_email, el.occurred_at::text, el.payload, el.source,
             count(*) OVER()::int AS total_count
      FROM events.event_log el
      LEFT JOIN identity.users u ON u.id = el.actor_user_id
      ${auditSubjectJoins("el")}
      WHERE ${filters.join(" AND ")}
      ORDER BY el.occurred_at DESC LIMIT $${limPos} OFFSET $${offPos}`;
    return withCurrentUser(req.user!.uuid, async (client) => {
      await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [d.operating_company_id]);
      const res = await client.query(sql, values);
      return { rows: res.rows, total_count: Number(res.rows[0]?.total_count ?? 0), limit: d.limit, offset: d.offset };
    });
  });

  /** Deduction trail */
  app.get("/api/v1/audit/reports/deduction-trail", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
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
      SELECT el.event_type, el.subject_type, el.subject_id::text, ${auditSubjectProjection("el")}, el.actor_user_id::text,
             u.email AS actor_email, el.occurred_at::text, el.payload, el.source,
             count(*) OVER()::int AS total_count
      FROM events.event_log el
      LEFT JOIN identity.users u ON u.id = el.actor_user_id
      ${auditSubjectJoins("el")}
      WHERE ${filters.join(" AND ")}
      ORDER BY el.occurred_at DESC LIMIT $${limPos} OFFSET $${offPos}`;
    return withCurrentUser(req.user!.uuid, async (client) => {
      await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [d.operating_company_id]);
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
  app.get("/api/v1/audit/reports/void-reversal", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
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
        SELECT el.event_type, el.subject_type, el.subject_id,
               el.actor_user_id::text AS actor_user_id, el.occurred_at AS occurred_at,
               el.payload, el.source, 'events.event_log'::text AS audit_source,
               el.operating_company_id, el.source_table, el.source_reference_id
        FROM events.event_log el
        WHERE el.operating_company_id = $1::uuid
          AND el.event_type ILIKE ANY(ARRAY['%void%','%revers%','%cancel%'])
          ${elDate ? `AND ${elDate}` : ""}
        UNION ALL
        SELECT ae.event_class AS event_type,
               -- VOID-REVERSAL-REPORT-SUBJECT-NOT-VISIBLE: CODER-12-VOID-SPINE's
               -- accounting.journal_entry.reversed payloads carry reversed_entity_type, not
               -- resource_type (a different event source's naming convention) -- without this
               -- fallback subject_type is NULL for every one of these rows, so the shared
               -- auditSubjectProjection() CASE below always falls to its ELSE NULL branch
               -- regardless of how many subject_type arms it has.
               COALESCE(ae.payload->>'resource_type', ae.payload->>'reversed_entity_type') AS subject_type,
               CASE WHEN COALESCE(ae.payload->>'resource_id', ae.payload->>'reversed_entity_id',
                                  ae.payload->>'expense_id', ae.payload->>'entity_id', '')
                              ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                    THEN COALESCE(ae.payload->>'resource_id', ae.payload->>'reversed_entity_id',
                                  ae.payload->>'expense_id', ae.payload->>'entity_id')::uuid
                    ELSE NULL END AS subject_id,
               ae.actor_user_uuid::text AS actor_user_id, ae.created_at AS occurred_at,
               ae.payload, ae.source, 'audit.audit_events'::text AS audit_source,
               $1::uuid AS operating_company_id,
               COALESCE(ae.payload->>'resource_type', ae.payload->>'reversed_entity_type') AS source_table,
               CASE WHEN COALESCE(ae.payload->>'resource_id', ae.payload->>'reversed_entity_id',
                                  ae.payload->>'expense_id', ae.payload->>'entity_id', '')
                              ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                    THEN COALESCE(ae.payload->>'resource_id', ae.payload->>'reversed_entity_id',
                                  ae.payload->>'expense_id', ae.payload->>'entity_id')::uuid
                    ELSE NULL END AS source_reference_id
        FROM audit.audit_events ae
        WHERE ae.event_class ILIKE ANY(ARRAY['%void%','%revers%','%cancel%'])
          AND COALESCE(ae.payload->>'operating_company_id', '') IN ('', $1::text)
          ${aeDate ? `AND ${aeDate}` : ""}
      )
      SELECT c.event_type, c.subject_type, c.subject_id::text, ${auditSubjectProjection("c")}, c.actor_user_id,
             u.email AS actor_email, c.occurred_at::text AS occurred_at, c.payload, c.source,
             c.audit_source, count(*) OVER()::int AS total_count
      FROM combined c
      LEFT JOIN identity.users u ON u.id = c.actor_user_id::uuid
      ${auditSubjectJoins("c")}
      ORDER BY c.occurred_at DESC
      LIMIT $${limPos} OFFSET $${offPos}`;
    return withCurrentUser(req.user!.uuid, async (client) => {
      await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [d.operating_company_id]);
      const res = await client.query(sql, values);
      return { rows: res.rows, total_count: Number(res.rows[0]?.total_count ?? 0), limit: d.limit, offset: d.offset };
    });
  });

  /** Period close history */
  app.get("/api/v1/audit/reports/period-close-history", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
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
      SELECT el.event_type, el.subject_type, el.subject_id::text, ${auditSubjectProjection("el")}, el.actor_user_id::text,
             u.email AS actor_email, el.occurred_at::text, el.payload, el.source,
             count(*) OVER()::int AS total_count
      FROM events.event_log el
      LEFT JOIN identity.users u ON u.id = el.actor_user_id
      ${auditSubjectJoins("el")}
      WHERE ${filters.join(" AND ")}
      ORDER BY el.occurred_at DESC LIMIT $${limPos} OFFSET $${offPos}`;
    return withCurrentUser(req.user!.uuid, async (client) => {
      await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [d.operating_company_id]);
      const res = await client.query(sql, values);
      return { rows: res.rows, total_count: Number(res.rows[0]?.total_count ?? 0), limit: d.limit, offset: d.offset };
    });
  });
}
