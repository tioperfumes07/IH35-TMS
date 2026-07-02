import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import XLSX from "xlsx";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const querySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const reportIds = [
  "cost_per_unit",
  "cost_per_mile",
  "cost_by_source_type",
  "pm_compliance_summary",
  "inspection_pass_fail_rate",
  "top_vendors_by_spend",
  "work_orders_over_threshold",
  "work_orders_aged_over_days",
] as const;

const reportParamsSchema = z.object({
  report: z.enum(reportIds),
});

type ReportId = (typeof reportIds)[number];

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function validationError(reply: FastifyReply, err: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: err.flatten() });
}

async function withCompany<T>(userId: string, companyId: string, fn: (client: any) => Promise<T>) {
  await assertCompanyMembership(userId, companyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
    return fn(client);
  });
}

async function buildRows(client: any, companyId: string, report: ReportId): Promise<Array<Record<string, unknown>>> {
  switch (report) {
    case "cost_per_unit":
      return (
        await client.query(
          `SELECT unit_id::text, COUNT(*)::int AS work_orders, COALESCE(SUM(total_actual_cost),0)::numeric(12,2) AS total_cost
           FROM maintenance.work_orders WHERE operating_company_id = $1 GROUP BY unit_id ORDER BY total_cost DESC NULLS LAST LIMIT 50`,
          [companyId]
        )
      ).rows;
    case "cost_per_mile":
      return (
        await client.query(
          `SELECT unit_id::text, COALESCE(SUM(total_actual_cost),0)::numeric(12,2) AS total_cost, COUNT(*)::int AS work_orders
           FROM maintenance.work_orders WHERE operating_company_id = $1 GROUP BY unit_id ORDER BY total_cost DESC NULLS LAST LIMIT 50`,
          [companyId]
        )
      ).rows;
    case "cost_by_source_type":
      return (
        await client.query(
          `SELECT source_type, COUNT(*)::int AS work_orders, COALESCE(SUM(total_actual_cost),0)::numeric(12,2) AS total_cost
           FROM maintenance.work_orders WHERE operating_company_id = $1 GROUP BY source_type ORDER BY total_cost DESC NULLS LAST`,
          [companyId]
        )
      ).rows;
    case "pm_compliance_summary":
      return (
        await client.query(
          `SELECT
             COUNT(*)::int AS schedules,
             COUNT(*) FILTER (WHERE next_due_odometer IS NOT NULL)::int AS with_due_meter
           FROM maintenance.pm_schedules WHERE operating_company_id = $1 AND is_active = true`,
          [companyId]
        )
      ).rows;
    case "inspection_pass_fail_rate": {
      // The canonical inspection table compliance.dot_inspection_events is a station DWELL-event
      // table (arrived_at/departed_at/dwell_minutes/follow_up_state) — it has NO pass/fail "outcome"
      // column, and there is no pass/fail data model anywhere yet. (The old query read a phantom
      // maintenance.dot_inspection_events and 42P01'd.) Degrade to empty rather than 42P01/42703;
      // forward-compatible — if an `outcome` column is later added, this lights up automatically.
      // FLAGGED to Jorge: inspection_pass_fail_rate needs a real compliance/DVIR data source.
      const hasOutcome = await client.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'compliance' AND table_name = 'dot_inspection_events'
           AND column_name = 'outcome' LIMIT 1`
      );
      if (hasOutcome.rows.length === 0) return [];
      return (
        await client.query(
          `SELECT outcome, COUNT(*)::int AS inspections
           FROM compliance.dot_inspection_events WHERE operating_company_id = $1 GROUP BY outcome`,
          [companyId]
        )
      ).rows;
    }
    case "top_vendors_by_spend":
      return (
        await client.query(
          `SELECT COALESCE(v.display_name, w.external_vendor_id::text) AS vendor_name, COALESCE(SUM(w.total_actual_cost),0)::numeric(12,2) AS total_spend
           FROM maintenance.work_orders w
           LEFT JOIN mdata.qbo_vendors v ON v.id = w.external_vendor_id
           WHERE w.operating_company_id = $1
           GROUP BY vendor_name
           ORDER BY total_spend DESC NULLS LAST
           LIMIT 20`,
          [companyId]
        )
      ).rows;
    case "work_orders_over_threshold":
      return (
        await client.query(
          `SELECT id::text, display_id, total_actual_cost
           FROM maintenance.work_orders
           WHERE operating_company_id = $1 AND COALESCE(total_actual_cost,0) >= 1000
           ORDER BY total_actual_cost DESC NULLS LAST
           LIMIT 100`,
          [companyId]
        )
      ).rows;
    case "work_orders_aged_over_days":
      return (
        await client.query(
          `SELECT id::text, display_id, status, EXTRACT(day FROM now() - COALESCE(opened_at, created_at))::int AS age_days
           FROM maintenance.work_orders
           WHERE operating_company_id = $1
             AND status NOT IN ('complete','completed','cancelled')
             AND now() - COALESCE(opened_at, created_at) > INTERVAL '7 days'
           ORDER BY age_days DESC
           LIMIT 100`,
          [companyId]
        )
      ).rows;
  }
}

export async function registerMaintenanceReportsRoutes(app: FastifyInstance) {
  app.get("/api/v1/maintenance/reports/:report", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = reportParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const rows = await withCompany(user.uuid, query.data.operating_company_id, (client) =>
      buildRows(client, query.data.operating_company_id, params.data.report)
    );
    return { report: params.data.report, rows };
  });

  app.get("/api/v1/maintenance/reports/:report/export.xlsx", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = reportParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const rows = await withCompany(user.uuid, query.data.operating_company_id, (client) =>
      buildRows(client, query.data.operating_company_id, params.data.report)
    );
    const wb = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, sheet, "report");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    reply.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    reply.header("Content-Disposition", `attachment; filename="${params.data.report}.xlsx"`);
    return reply.send(buffer);
  });
}
