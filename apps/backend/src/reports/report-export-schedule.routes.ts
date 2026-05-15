import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import { computeNextRunAt } from "../scheduled-reports/next-run.js";
import { appendReportingAuditEvent } from "../scheduled-reports/reporting-audit.js";
import { REPORT_LIBRARY } from "./shared.js";

function accountingRoles(role: string) {
  return ["Owner", "Administrator", "Accountant"].includes(role);
}

const exportQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  format: z.enum(["csv", "pdf"]).default("csv"),
  as_of_date: z.string().date().optional(),
});

const scheduleBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  frequency: z.enum(["daily", "weekly", "monthly"]),
  time_local: z.string().regex(/^\d{1,2}:\d{2}$/),
  day_of_week: z.number().int().min(0).max(6).optional(),
  day_of_month: z.number().int().min(1).max(31).optional(),
  recipients: z.array(z.string().email()).min(1),
  format: z.enum(["pdf", "csv"]),
  subject: z.string().min(1).max(500).optional(),
});

function rowsToCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return "";
  const keys = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  return [keys.join(","), ...rows.map((r) => keys.map((k) => esc(r[k])).join(","))].join("\n");
}

export async function registerReportExportAndScheduleRoutes(app: FastifyInstance) {
  app.get("/api/v1/reports/:reportName/export", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!accountingRoles(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const params = z.object({ reportName: z.string().min(1).max(120) }).safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const q = exportQuerySchema.safeParse(req.query ?? {});
    if (!q.success) return validationError(reply, q.error);

    const exists = REPORT_LIBRARY.some((r) => r.id === params.data.reportName);
    if (!exists) return reply.code(404).send({ error: "unknown_report" });

    if (q.data.format === "pdf") {
      return reply.code(501).send({ error: "pdf_export_not_implemented_use_html" });
    }

    const asOf = q.data.as_of_date ?? new Date().toISOString().slice(0, 10);

    const csv = await withCompanyScope(user.uuid, q.data.operating_company_id, async (client) => {
      if (params.data.reportName === "ar-aging") {
        const res = await client.query(
          `
            SELECT
              c.customer_name AS customer,
              COALESCE(SUM(i.amount_open_cents), 0)::text AS open_cents
            FROM accounting.invoices i
            JOIN mdata.customers c ON c.id = i.customer_id
            WHERE i.status IN ('sent', 'partial')
              AND i.voided_at IS NULL
              AND i.operating_company_id = $1
            GROUP BY c.customer_name
            ORDER BY open_cents DESC
          `,
          [q.data.operating_company_id]
        );
        return rowsToCsv(res.rows as Array<Record<string, unknown>>);
      }
      if (params.data.reportName === "ap-aging") {
        const res = await client.query(
          `
            SELECT
              v.vendor_name AS vendor,
              COALESCE(SUM(b.amount_cents - b.paid_cents), 0)::text AS open_cents
            FROM accounting.bills b
            LEFT JOIN mdata.vendors v ON v.id = b.vendor_id
            WHERE b.revoked_at IS NULL
              AND b.status NOT IN ('paid', 'void', 'voided')
              AND b.operating_company_id = $1
            GROUP BY v.vendor_name
            ORDER BY open_cents DESC
          `,
          [q.data.operating_company_id]
        );
        return rowsToCsv(res.rows as Array<Record<string, unknown>>);
      }
      return rowsToCsv([{ report: params.data.reportName, as_of: asOf, note: "no_csv_runner_for_report" }]);
    });

    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="${params.data.reportName}.csv"`);
    return reply.send(csv);
  });

  app.post("/api/v1/reports/:reportName/schedule", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!accountingRoles(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const params = z.object({ reportName: z.string().min(1).max(120) }).safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const body = scheduleBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const exists = REPORT_LIBRARY.some((r) => r.id === params.data.reportName);
    if (!exists) return reply.code(404).send({ error: "unknown_report" });

    const frequency = body.data.frequency;
    const run_day_of_week = frequency === "weekly" ? body.data.day_of_week ?? 1 : null;
    const run_day_of_month = frequency === "monthly" ? body.data.day_of_month ?? 1 : null;

    const nextRunAt = computeNextRunAt(
      {
        frequency,
        run_time: body.data.time_local,
        run_day_of_week,
        run_day_of_month,
        cron_expression: null,
        timezone: "America/Chicago",
      },
      new Date()
    );

    const insertedId = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
      const ok = await client.query(`SELECT to_regclass('reporting.scheduled_reports') IS NOT NULL AS ok`);
      if (!ok.rows[0]?.ok) return null;
      const res = await client.query(
        `
          INSERT INTO reporting.scheduled_reports (
            operating_company_id,
            report_id,
            report_params,
            frequency,
            cron_expression,
            run_time,
            run_day_of_week,
            run_day_of_month,
            timezone,
            recipients_to,
            recipients_cc,
            recipients_bcc,
            subject_template,
            format,
            status,
            created_by_user_id,
            next_run_at
          )
          VALUES (
            $1,$2,$3::jsonb,$4,$5,$6::time,$7,$8,$9,$10::text[],$11,$12,$13,$14,'active',$15,$16
          )
          RETURNING id
        `,
        [
          body.data.operating_company_id,
          params.data.reportName,
          JSON.stringify({ source: "reports_runner_ui" }),
          frequency,
          null,
          `${body.data.time_local}:00`,
          run_day_of_week,
          run_day_of_month,
          "America/Chicago",
          body.data.recipients,
          null,
          null,
          body.data.subject ?? `Scheduled ${params.data.reportName}`,
          body.data.format,
          user.uuid,
          nextRunAt,
        ]
      );
      return res.rows[0]?.id ? String(res.rows[0].id) : null;
    });

    if (!insertedId) return reply.code(503).send({ error: "scheduled_reports_unavailable" });

    await appendReportingAuditEvent(
      "scheduled_report.created_via_reports_api",
      "info",
      { scheduled_report_id: insertedId, report_id: params.data.reportName },
      user.uuid
    );

    return { id: insertedId };
  });
}
