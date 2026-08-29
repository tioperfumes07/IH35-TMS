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
  if (!requireAuth(req, reply)) return reply;
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
      WHEN ${alias}.subject_type = 'task' AND ${alias}.source_table = 'banking.transfers' THEN 'transfer'
      WHEN ${alias}.subject_type = 'task' AND ${alias}.source_table = 'accounting.payments' THEN 'payment'
      -- VOID-REVERSAL-REPORT-PAYLOAD-SUBJECT-TYPE-VOCABULARY-MISMATCH: the void-reversal route's
      -- audit.audit_events arm normalizes its raw payload-derived subject_type to 'task' + this
      -- source_table for these 3 tables (see that route's combined CTE); they had no resolver here.
      WHEN ${alias}.subject_type = 'task' AND ${alias}.source_table = 'accounting.bill_payments' THEN 'bill_payment'
      WHEN ${alias}.subject_type = 'task' AND ${alias}.source_table = 'catalogs.load_cancellation_reasons' THEN 'load_cancellation_reason'
      WHEN ${alias}.subject_type = 'task' AND ${alias}.source_table = 'catalogs.void_cancel_reasons' THEN 'void_cancel_reason'
      WHEN ${alias}.subject_type = 'task' AND ${alias}.source_table = 'mdata.customer_quality_events' THEN 'customer_quality_event'
      WHEN ${alias}.subject_type = 'task' AND ${alias}.source_table = 'driver_finance.driver_settlements' THEN 'driver_settlement'
      -- Live-observed on /reports/audit/financial-change-log: request.posted events (source
      -- "driver_request") carry subject_type='task', source_table='driver_finance.cash_advance_requests'
      -- -- correctly populated by the emitter, simply never added to this shared resolver.
      WHEN ${alias}.subject_type = 'task' AND ${alias}.source_table = 'driver_finance.cash_advance_requests' THEN 'cash_advance_request'
      -- Live-observed on /reports/audit/activity-by-module: reconciliation.started/.completed
      -- (source "banking") and transaction.categorized carry subject_type='task', source_table
      -- 'banking.reconciliation_sessions'/'banking.bank_transactions' -- correctly populated by the
      -- emitter, simply never added to this shared resolver.
      WHEN ${alias}.subject_type = 'task' AND ${alias}.source_table = 'banking.reconciliation_sessions' THEN 'reconciliation_session'
      WHEN ${alias}.subject_type = 'task' AND ${alias}.source_table = 'banking.bank_transactions' THEN 'bank_transaction'
      ELSE ${alias}.subject_type
    END AS subject_kind,
    CASE
      WHEN ${alias}.subject_type = 'load' THEN NULLIF(TRIM(audit_load.load_number), '')
      WHEN ${alias}.subject_type = 'driver' THEN NULLIF(TRIM(CONCAT_WS(' ', audit_driver.first_name, audit_driver.last_name)), '')
      WHEN ${alias}.subject_type = 'unit' THEN NULLIF(TRIM(audit_unit.unit_number), '')
      -- AUDIT-TRAIL-SUBJECT-LABEL-LOST-FOR-DEACTIVATED-ENTITIES: mdata.customers'/mdata.vendors' own
      -- FORCE RLS policies exclude deactivated-but-not-deleted rows for a non-bypass reader, so the
      -- audit_customer/audit_vendor LEFT JOINs below produce a NULL-extended row (the row genuinely
      -- never enters the join's candidate set) for any customer.*/vendor.* event whose subject was
      -- later deactivated -- even though void-not-delete correctly preserved the row and its name is
      -- fully available. Falls back to the canonical same-company label resolvers (SECURITY DEFINER,
      -- already proven at scale by invoices/payments/transaction-register/customer-profitability/
      -- dispatch-margin) instead of widening RLS or the join itself.
      WHEN ${alias}.subject_type = 'customer' THEN COALESCE(NULLIF(TRIM(audit_customer.customer_name), ''), mdata.resolve_customer_label_same_company(${alias}.subject_id, ${alias}.operating_company_id))
      WHEN ${alias}.subject_type = 'vendor' THEN COALESCE(NULLIF(TRIM(audit_vendor.vendor_name), ''), mdata.resolve_vendor_label_same_company(${alias}.subject_id, ${alias}.operating_company_id))
      WHEN ${alias}.subject_type = 'invoice' THEN NULLIF(TRIM(audit_invoice.display_id), '')
      WHEN ${alias}.subject_type = 'bill' THEN NULLIF(TRIM(COALESCE(audit_bill.display_id, audit_bill.bill_number)), '')
      WHEN ${alias}.subject_type = 'journal_entry' THEN NULLIF(TRIM(audit_je.memo), '')
      WHEN ${alias}.subject_type = 'customer_payment' THEN NULLIF(TRIM(audit_customer_payment.display_id), '')
      WHEN ${alias}.subject_type = 'prepaid_purchase' THEN NULLIF(TRIM(COALESCE(audit_prepaid.asset_number, audit_prepaid.description)), '')
      -- AUDIT-EVENTS-PAYLOAD-NO-RESOURCE-TYPE-FIELD: some audit.audit_events payloads carry a
      -- direct id key (expense_id, task_id, hos_violation_id, internal_fine_id, or the
      -- insurance.policy.cancelled resource_id) but NO resource_type/reversed_entity_type/
      -- entity_type field at all -- the void-reversal route's combined CTE falls back to
      -- event_class to assign these 5 direct (non-'task'-wrapped) subject_type values.
      WHEN ${alias}.subject_type = 'insurance_policy' THEN NULLIF(TRIM(audit_insurance_policy.policy_number), '')
      WHEN ${alias}.subject_type = 'expense' THEN NULLIF(TRIM(COALESCE(audit_expense.expense_number, audit_expense.memo)), '')
      WHEN ${alias}.subject_type = 'daily_task' THEN NULLIF(TRIM(audit_daily_task.title), '')
      WHEN ${alias}.subject_type = 'hos_violation' THEN NULLIF(TRIM(audit_hos_violation.violation_type), '')
      WHEN ${alias}.subject_type = 'internal_fine' THEN NULLIF(TRIM('Fine ' || to_char(audit_internal_fine.imposed_date, 'YYYY-MM-DD') || ' — $' || audit_internal_fine.amount::text), '')
      -- DEDUCTION-TRAIL-MISSING-AUDIT-EVENTS-SINK: safety.fine.created (civil/DOT fines, distinct
      -- from internal company fines) had no resolver at all.
      WHEN ${alias}.subject_type = 'civil_fine' THEN NULLIF(TRIM(COALESCE(audit_civil_fine.violation_code, audit_civil_fine.violation_description)), '')
      -- 982-row-scale gap on /reports/audit/activity-by-module: recon.run_started/.completed (RECON-01,
      -- the twice-daily AM/PM reconciliation job) carry subject_type='alert' with a real, joinable
      -- subject_id (accounting.recon_runs) -- 'alert' had zero resolver anywhere, not even a label
      -- branch, despite the referenced row always existing.
      WHEN ${alias}.subject_type = 'alert' THEN NULLIF(TRIM(INITCAP(REPLACE(audit_recon_run.run_type, '_', ' ')) || ' — ' || to_char(audit_recon_run.window_start, 'YYYY-MM-DD')), '')
      WHEN ${alias}.subject_type = 'task' THEN CASE ${alias}.source_table
        WHEN 'maintenance.work_orders' THEN NULLIF(TRIM(audit_wo.display_id), '')
        WHEN 'accounting.invoices' THEN NULLIF(TRIM(audit_invoice.display_id), '')
        WHEN 'accounting.bills' THEN NULLIF(TRIM(COALESCE(audit_bill.display_id, audit_bill.bill_number)), '')
        WHEN 'banking.transfers' THEN NULLIF(TRIM(COALESCE(audit_transfer.reference_number, audit_transfer.memo)), '')
        WHEN 'accounting.payments' THEN NULLIF(TRIM(audit_customer_payment.display_id), '')
        WHEN 'accounting.bill_payments' THEN NULLIF(TRIM(COALESCE(audit_bill_payment.reference_number, audit_bill_payment.check_number, audit_bill_payment.memo)), '')
        WHEN 'catalogs.load_cancellation_reasons' THEN NULLIF(TRIM(audit_load_cancel_reason.display_name), '')
        WHEN 'catalogs.void_cancel_reasons' THEN NULLIF(TRIM(audit_void_cancel_reason.reason_label), '')
        WHEN 'mdata.customer_quality_events' THEN NULLIF(TRIM(audit_customer_quality_event.summary), '')
        WHEN 'driver_finance.driver_settlements' THEN NULLIF(TRIM(audit_driver_settlement.display_id), '')
        WHEN 'driver_finance.cash_advance_requests' THEN NULLIF(TRIM(audit_cash_advance_request.display_id), '')
        WHEN 'banking.reconciliation_sessions' THEN NULLIF(TRIM('Reconciliation ' || to_char(audit_recon_session.period_start, 'YYYY-MM-DD') || '–' || to_char(audit_recon_session.period_end, 'YYYY-MM-DD')), '')
        WHEN 'banking.bank_transactions' THEN NULLIF(TRIM(COALESCE(audit_bank_txn.description, audit_bank_txn.merchant_name)), '')
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
     AND (audit_driver.operating_company_id = ${alias}.operating_company_id OR EXISTS (
       SELECT 1 FROM mdata.driver_company_authorizations audit_driver_dca
       WHERE audit_driver_dca.driver_id = audit_driver.id
         AND audit_driver_dca.company_id = ${alias}.operating_company_id
         AND audit_driver_dca.is_authorized = true
         AND audit_driver_dca.deactivated_at IS NULL
     ))
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
      ON (( ${alias}.subject_type = 'customer_payment' AND audit_customer_payment.id = ${alias}.subject_id )
       OR ( ${alias}.subject_type = 'task' AND ${alias}.source_table = 'accounting.payments'
            AND audit_customer_payment.id = ${alias}.source_reference_id ))
     AND audit_customer_payment.operating_company_id = ${alias}.operating_company_id
    LEFT JOIN accounting.prepaid_assets audit_prepaid
      ON ${alias}.subject_type = 'prepaid_purchase'
     AND audit_prepaid.id = ${alias}.subject_id
     AND audit_prepaid.operating_company_id = ${alias}.operating_company_id
    LEFT JOIN banking.transfers audit_transfer
      ON ${alias}.subject_type = 'task'
     AND ${alias}.source_table = 'banking.transfers'
     AND audit_transfer.id = ${alias}.source_reference_id
     AND audit_transfer.operating_company_id = ${alias}.operating_company_id
    LEFT JOIN accounting.bill_payments audit_bill_payment
      ON ${alias}.subject_type = 'task'
     AND ${alias}.source_table = 'accounting.bill_payments'
     AND audit_bill_payment.id = ${alias}.source_reference_id
     AND audit_bill_payment.operating_company_id = ${alias}.operating_company_id
    LEFT JOIN catalogs.load_cancellation_reasons audit_load_cancel_reason
      ON ${alias}.subject_type = 'task'
     AND ${alias}.source_table = 'catalogs.load_cancellation_reasons'
     AND audit_load_cancel_reason.id = ${alias}.source_reference_id
     AND audit_load_cancel_reason.operating_company_id = ${alias}.operating_company_id
    LEFT JOIN catalogs.void_cancel_reasons audit_void_cancel_reason
      ON ${alias}.subject_type = 'task'
     AND ${alias}.source_table = 'catalogs.void_cancel_reasons'
     AND audit_void_cancel_reason.id = ${alias}.source_reference_id
     AND audit_void_cancel_reason.operating_company_id = ${alias}.operating_company_id
    LEFT JOIN mdata.customer_quality_events audit_customer_quality_event
      ON ${alias}.subject_type = 'task'
     AND ${alias}.source_table = 'mdata.customer_quality_events'
     AND audit_customer_quality_event.id = ${alias}.source_reference_id
    LEFT JOIN driver_finance.driver_settlements audit_driver_settlement
      ON ${alias}.subject_type = 'task'
     AND ${alias}.source_table = 'driver_finance.driver_settlements'
     AND audit_driver_settlement.id = ${alias}.source_reference_id
     AND audit_driver_settlement.operating_company_id = ${alias}.operating_company_id
    LEFT JOIN driver_finance.cash_advance_requests audit_cash_advance_request
      ON ${alias}.subject_type = 'task'
     AND ${alias}.source_table = 'driver_finance.cash_advance_requests'
     AND audit_cash_advance_request.id = ${alias}.source_reference_id
     AND audit_cash_advance_request.operating_company_id = ${alias}.operating_company_id
    LEFT JOIN insurance.policy audit_insurance_policy
      ON ${alias}.subject_type = 'insurance_policy'
     AND audit_insurance_policy.id = ${alias}.subject_id
     AND audit_insurance_policy.operating_company_id = ${alias}.operating_company_id
    LEFT JOIN accounting.expenses audit_expense
      ON ${alias}.subject_type = 'expense'
     AND audit_expense.id = ${alias}.subject_id
     AND audit_expense.operating_company_id = ${alias}.operating_company_id
    LEFT JOIN ops.daily_tasks audit_daily_task
      ON ${alias}.subject_type = 'daily_task'
     AND audit_daily_task.id = ${alias}.subject_id
     AND audit_daily_task.operating_company_id = ${alias}.operating_company_id
    LEFT JOIN safety.hos_violations audit_hos_violation
      ON ${alias}.subject_type = 'hos_violation'
     AND audit_hos_violation.id = ${alias}.subject_id
     AND audit_hos_violation.operating_company_id = ${alias}.operating_company_id
    LEFT JOIN safety.internal_fines audit_internal_fine
      ON ${alias}.subject_type = 'internal_fine'
     AND audit_internal_fine.id = ${alias}.subject_id
     AND audit_internal_fine.operating_company_id = ${alias}.operating_company_id
    LEFT JOIN safety.civil_fines audit_civil_fine
      ON ${alias}.subject_type = 'civil_fine'
     AND audit_civil_fine.id = ${alias}.subject_id
     AND audit_civil_fine.operating_company_id = ${alias}.operating_company_id
    LEFT JOIN accounting.recon_runs audit_recon_run
      ON ${alias}.subject_type = 'alert'
     AND audit_recon_run.id = ${alias}.subject_id
     AND audit_recon_run.operating_company_id = ${alias}.operating_company_id
    LEFT JOIN banking.reconciliation_sessions audit_recon_session
      ON ${alias}.subject_type = 'task'
     AND ${alias}.source_table = 'banking.reconciliation_sessions'
     AND audit_recon_session.id = ${alias}.source_reference_id
     AND audit_recon_session.operating_company_id = ${alias}.operating_company_id
    LEFT JOIN banking.bank_transactions audit_bank_txn
      ON ${alias}.subject_type = 'task'
     AND ${alias}.source_table = 'banking.bank_transactions'
     AND audit_bank_txn.id = ${alias}.source_reference_id
     AND audit_bank_txn.operating_company_id = ${alias}.operating_company_id`;
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
      // MAINTENANCE-DECISION-LOG-WO-EVENT-PREFIX-NOT-MATCHED: this report was 100% empty for every
      // company -- the emitter logs work-order lifecycle events as "wo.created"/"wo.status_changed"
      // (the actual decision trail: created -> in_progress -> complete), but the filter only matched
      // the literal substring "work_order", which never appears in a "wo."-prefixed event_type.
      // Confirmed live: 0 events.event_log rows anywhere in prod match "defect"/"dvir"/"failure" --
      // wo.* IS the real decision-log data source, just excluded by this pattern mismatch.
      `el.event_type ILIKE ANY(ARRAY['%maintenance%','%work_order%','wo.%','%inspection%','%repair%','%defect%'])`,
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

  /** Deduction trail.
   *  UNIONs TWO audit sinks, same shape as void-reversal's combined CTE:
   *    1. events.event_log — never actually carries a deduction/fine event today (confirmed on
   *       prod: zero rows match this filter across ALL companies, all time).
   *    2. audit.audit_events — where every real deduction/fine transaction event actually lands
   *       (safety.internal_fine.*, safety.company_violation.auto_fine_created, safety.fine.created,
   *       driver_finance.deduction.created, driver_finance.settlement.deductions_applied). The
   *       original report read ONLY (1) and was therefore 100% empty for every company, always --
   *       DEDUCTION-TRAIL-MISSING-AUDIT-EVENTS-SINK, the same root-cause family as the original
   *       VOID-REVERSAL bug. Each event_class carries the entity id under its own payload key (no
   *       shared resource_type/resource_id convention), so subject_type/subject_id are derived by
   *       event_class, reusing existing resolvers wherever one already exists (internal_fine,
   *       driver, and the task+driver_finance.driver_settlements branch) rather than inventing new
   *       joins. Deliberately does NOT special-case the 3 catalogs.*_fine_types/*_reasons_created/
   *       deactivated events matched by the same broad filter -- those are catalog/config setup, not
   *       driver-facing deduction transactions; they still appear (raw event_class, generic subject),
   *       same fallback behavior as any other unmapped event elsewhere in this file. */
  app.get("/api/v1/audit/reports/deduction-trail", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!authGuard(req, reply)) return;
    const p = baseQuerySchema.extend({
      driver_id: z.string().uuid().optional(),
    }).safeParse(req.query ?? {});
    if (!p.success) return reply.code(400).send({ error: "validation_error", details: p.error.flatten() });
    const d = p.data;
    const values: unknown[] = [d.operating_company_id];
    let fromPos = 0;
    let toPos = 0;
    if (d.from) { values.push(d.from); fromPos = values.length; }
    if (d.to) { values.push(d.to); toPos = values.length; }
    let driverPos = 0;
    if (d.driver_id) { values.push(d.driver_id); driverPos = values.length; }
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
          AND el.event_type ILIKE ANY(ARRAY['%deduction%','%fine%','%accident_cost%','%chargeback%'])
          ${elDate ? `AND ${elDate}` : ""}
        UNION ALL
        SELECT ae.event_class AS event_type,
               CASE
                 WHEN ae.event_class IN ('safety.company_violation.auto_fine_created', 'safety.internal_fine.created', 'safety.internal_fine.voided') THEN 'internal_fine'
                 WHEN ae.event_class = 'safety.fine.created' THEN 'civil_fine'
                 WHEN ae.event_class = 'driver_finance.deduction.created' THEN 'driver'
                 WHEN ae.event_class = 'driver_finance.settlement.deductions_applied' THEN 'task'
                 ELSE NULL
               END AS subject_type,
               CASE WHEN COALESCE(
                              CASE WHEN ae.event_class IN ('safety.company_violation.auto_fine_created', 'safety.internal_fine.created', 'safety.internal_fine.voided') THEN ae.payload->>'internal_fine_id' END,
                              CASE WHEN ae.event_class = 'safety.fine.created' THEN ae.payload->>'resource_id' END,
                              CASE WHEN ae.event_class = 'driver_finance.deduction.created' THEN ae.payload->>'driver_id' END,
                              CASE WHEN ae.event_class = 'driver_finance.settlement.deductions_applied' THEN ae.payload->>'settlement_id' END,
                              '')
                              ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                    THEN COALESCE(
                              CASE WHEN ae.event_class IN ('safety.company_violation.auto_fine_created', 'safety.internal_fine.created', 'safety.internal_fine.voided') THEN ae.payload->>'internal_fine_id' END,
                              CASE WHEN ae.event_class = 'safety.fine.created' THEN ae.payload->>'resource_id' END,
                              CASE WHEN ae.event_class = 'driver_finance.deduction.created' THEN ae.payload->>'driver_id' END,
                              CASE WHEN ae.event_class = 'driver_finance.settlement.deductions_applied' THEN ae.payload->>'settlement_id' END
                         )::uuid
                    ELSE NULL END AS subject_id,
               ae.actor_user_uuid::text AS actor_user_id, ae.created_at AS occurred_at,
               ae.payload, ae.source, 'audit.audit_events'::text AS audit_source,
               $1::uuid AS operating_company_id,
               CASE WHEN ae.event_class = 'driver_finance.settlement.deductions_applied' THEN 'driver_finance.driver_settlements' ELSE NULL END AS source_table,
               CASE WHEN ae.event_class = 'driver_finance.settlement.deductions_applied'
                         AND (ae.payload->>'settlement_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                    THEN (ae.payload->>'settlement_id')::uuid
                    ELSE NULL END AS source_reference_id
        FROM audit.audit_events ae
        WHERE ae.event_class ILIKE ANY(ARRAY['%deduction%','%fine%','%accident_cost%','%chargeback%'])
          AND COALESCE(ae.payload->>'operating_company_id', '') IN ('', $1::text)
          ${aeDate ? `AND ${aeDate}` : ""}
      )
      SELECT c.event_type, c.subject_type, c.subject_id::text, ${auditSubjectProjection("c")}, c.actor_user_id,
             u.email AS actor_email, c.occurred_at::text AS occurred_at, c.payload, c.source,
             c.audit_source, count(*) OVER()::int AS total_count
      FROM combined c
      LEFT JOIN identity.users u ON u.id = c.actor_user_id::uuid
      ${auditSubjectJoins("c")}
      ${driverPos ? `WHERE c.subject_id = $${driverPos}::uuid` : ""}
      ORDER BY c.occurred_at DESC
      LIMIT $${limPos} OFFSET $${offPos}`;
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
               --
               -- VOID-REVERSAL-REPORT-PAYLOAD-SUBJECT-TYPE-VOCABULARY-MISMATCH: some payloads carry a
               -- raw dotted table-path in resource_type/reversed_entity_type (e.g. literally
               -- "accounting.invoices") instead of auditSubjectProjection()'s short vocabulary
               -- ("invoice", "task", ...) -- that CASE never matches a raw path, so it fell to a bare
               -- subject_kind = the raw path string and subject_label = NULL ("Subject — not
               -- visible"). Normalize known raw paths to the short vocabulary here; anything already
               -- short (or unrecognized) passes through unchanged via the ELSE.
               -- AUDIT-EVENTS-PAYLOAD-NO-RESOURCE-TYPE-FIELD: a further-distinct root cause from
               -- the raw-path vocabulary mismatch above -- these payloads have NO resource_type/
               -- reversed_entity_type/entity_type key at ALL (confirmed live: insurance.policy.cancelled,
               -- expense.voided, ops.daily_task.cancelled, safety.hos_violation.voided,
               -- safety.internal_fine.voided), so the COALESCE below is NULL and there is nothing to
               -- normalize -- fall back to the immutable ae.event_class to assign a direct subject_type.
               -- mdata.customers.seed_purge_prod_voided is the one payload that DOES carry a type key,
               -- just under a third name (entity_type) this route hadn't read yet.
               CASE
                 WHEN COALESCE(ae.payload->>'resource_type', ae.payload->>'reversed_entity_type', ae.payload->>'entity_type') = 'mdata.loads' THEN 'load'
                 WHEN COALESCE(ae.payload->>'resource_type', ae.payload->>'reversed_entity_type', ae.payload->>'entity_type') = 'accounting.journal_entries' THEN 'journal_entry'
                 WHEN COALESCE(ae.payload->>'resource_type', ae.payload->>'reversed_entity_type', ae.payload->>'entity_type') = 'accounting.invoices' THEN 'task'
                 WHEN COALESCE(ae.payload->>'resource_type', ae.payload->>'reversed_entity_type', ae.payload->>'entity_type') = 'accounting.bills' THEN 'task'
                 WHEN COALESCE(ae.payload->>'resource_type', ae.payload->>'reversed_entity_type', ae.payload->>'entity_type') = 'accounting.bill_payments' THEN 'task'
                 WHEN COALESCE(ae.payload->>'resource_type', ae.payload->>'reversed_entity_type', ae.payload->>'entity_type') = 'catalogs.load_cancellation_reasons' THEN 'task'
                 WHEN COALESCE(ae.payload->>'resource_type', ae.payload->>'reversed_entity_type', ae.payload->>'entity_type') = 'catalogs.void_cancel_reasons' THEN 'task'
                 WHEN COALESCE(ae.payload->>'resource_type', ae.payload->>'reversed_entity_type', ae.payload->>'entity_type') = 'mdata.customer_quality_events' THEN 'task'
                 WHEN COALESCE(ae.payload->>'resource_type', ae.payload->>'reversed_entity_type', ae.payload->>'entity_type') = 'driver_finance.driver_settlements' THEN 'task'
                 WHEN COALESCE(ae.payload->>'resource_type', ae.payload->>'reversed_entity_type', ae.payload->>'entity_type') = 'mdata.customers' THEN 'customer'
                 WHEN COALESCE(ae.payload->>'resource_type', ae.payload->>'reversed_entity_type', ae.payload->>'entity_type') IS NOT NULL
                   THEN COALESCE(ae.payload->>'resource_type', ae.payload->>'reversed_entity_type', ae.payload->>'entity_type')
                 WHEN ae.event_class = 'insurance.policy.cancelled' THEN 'insurance_policy'
                 WHEN ae.event_class = 'expense.voided' THEN 'expense'
                 WHEN ae.event_class = 'ops.daily_task.cancelled' THEN 'daily_task'
                 WHEN ae.event_class = 'safety.hos_violation.voided' THEN 'hos_violation'
                 WHEN ae.event_class = 'safety.internal_fine.voided' THEN 'internal_fine'
                 ELSE NULL
               END AS subject_type,
               CASE WHEN COALESCE(ae.payload->>'resource_id', ae.payload->>'reversed_entity_id',
                                  ae.payload->>'expense_id', ae.payload->>'entity_id',
                                  ae.payload->>'task_id', ae.payload->>'hos_violation_id',
                                  ae.payload->>'internal_fine_id', '')
                              ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                    THEN COALESCE(ae.payload->>'resource_id', ae.payload->>'reversed_entity_id',
                                  ae.payload->>'expense_id', ae.payload->>'entity_id',
                                  ae.payload->>'task_id', ae.payload->>'hos_violation_id',
                                  ae.payload->>'internal_fine_id')::uuid
                    ELSE NULL END AS subject_id,
               ae.actor_user_uuid::text AS actor_user_id, ae.created_at AS occurred_at,
               ae.payload, ae.source, 'audit.audit_events'::text AS audit_source,
               $1::uuid AS operating_company_id,
               COALESCE(ae.payload->>'resource_type', ae.payload->>'reversed_entity_type', ae.payload->>'entity_type') AS source_table,
               CASE WHEN COALESCE(ae.payload->>'resource_id', ae.payload->>'reversed_entity_id',
                                  ae.payload->>'expense_id', ae.payload->>'entity_id',
                                  ae.payload->>'task_id', ae.payload->>'hos_violation_id',
                                  ae.payload->>'internal_fine_id', '')
                              ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                    THEN COALESCE(ae.payload->>'resource_id', ae.payload->>'reversed_entity_id',
                                  ae.payload->>'expense_id', ae.payload->>'entity_id',
                                  ae.payload->>'task_id', ae.payload->>'hos_violation_id',
                                  ae.payload->>'internal_fine_id')::uuid
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
