import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { REPORT_LIBRARY, companyQuerySchema, currentAuthUser, getCurrentQuarterInfo, validationError, withCompanyScope } from "./shared.js";

const frequentlyRunQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  period: z.string().optional().default("7d"),
});

const runLogBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  report_id: z.string().min(1).max(120),
  report_name: z.string().min(1).max(200).optional(),
  filters: z.record(z.string(), z.unknown()).optional(),
  duration_ms: z.number().int().min(0).optional(),
  rows_returned: z.number().int().min(0).optional(),
});

const scheduledQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

export async function registerReportsLibraryRoutes(app: FastifyInstance) {
  app.get("/api/v1/reports/library", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    return { reports: REPORT_LIBRARY };
  });

  app.get("/api/v1/reports/frequently-run", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = frequentlyRunQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const periodDays = query.data.period === "7d" ? 7 : 7;

    const rows = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT report_id, count(*)::text AS run_count
          FROM reports.run_log
          WHERE operating_company_id = $1
            AND run_at >= (now() - ($2::int || ' days')::interval)
          GROUP BY report_id
          ORDER BY count(*) DESC
          LIMIT 8
        `,
        [query.data.operating_company_id, periodDays]
      );
      return res.rows as Array<{ report_id: string; run_count: string }>;
    });

    const countMap = new Map(rows.map((row) => [row.report_id, Number(row.run_count ?? 0)]));
    const ordered = [...REPORT_LIBRARY].sort((a, b) => (countMap.get(b.id) ?? 0) - (countMap.get(a.id) ?? 0));
    const top = ordered.slice(0, 8).map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      description: item.description,
      status: item.status,
      run_count: countMap.get(item.id) ?? 0,
      filters: "default",
      runs: countMap.get(item.id) ?? 0,
    }));
    return { rows: top };
  });

  app.get("/api/v1/reports/scheduled", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = scheduledQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const rows = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT id, report_id, cadence, cadence_detail, recipient_roles, recipient_emails
          FROM reports.scheduled_reports
          WHERE operating_company_id = $1
            AND enabled = true
          ORDER BY created_at ASC
        `,
        [query.data.operating_company_id]
      );
      return res.rows as Array<{
        id: string;
        report_id: string;
        cadence: string;
        cadence_detail: string | null;
        recipient_roles: string[] | null;
        recipient_emails: string[] | null;
      }>;
    });
    return {
      rows: rows.map((row) => {
        const reportName = REPORT_LIBRARY.find((item) => item.id === row.report_id)?.name ?? row.report_id;
        const recipientRoles = (row.recipient_roles ?? []).join(", ");
        const recipientEmails = (row.recipient_emails ?? []).join(", ");
        const recipients = [recipientRoles, recipientEmails].filter(Boolean).join(" · ") || "—";
        return {
          id: row.id,
          report_id: row.report_id,
          cadence: row.cadence,
          cadence_detail: row.cadence_detail,
          cadence_label: row.cadence_detail ?? row.cadence,
          name: reportName,
          recipients,
        };
      }),
    };
  });

  app.get("/api/v1/reports/kpi-summary", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const data = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const scheduledRes = await client.query(
        `SELECT count(*)::text AS cnt FROM reports.scheduled_reports WHERE operating_company_id = $1 AND enabled = true`,
        [query.data.operating_company_id]
      );
      const runRes = await client.query(
        `SELECT count(*)::text AS cnt FROM reports.run_log WHERE operating_company_id = $1 AND run_at >= now() - interval '7 days'`,
        [query.data.operating_company_id]
      );
      return {
        scheduled: Number(((scheduledRes.rows[0] as { cnt?: string } | undefined)?.cnt ?? 0)),
        run_last_7d: Number(((runRes.rows[0] as { cnt?: string } | undefined)?.cnt ?? 0)),
      };
    });

    return {
      available_reports: REPORT_LIBRARY.length,
      scheduled: data.scheduled,
      run_last_7d: data.run_last_7d,
      ifta_status: getCurrentQuarterInfo(),
    };
  });

  app.post("/api/v1/reports/run-log", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const body = runLogBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    try {
      await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
        const reportMeta = REPORT_LIBRARY.find((item) => item.id === body.data.report_id);
        await client.query(
          `
            INSERT INTO reports.run_log (
              operating_company_id, report_id, report_name, user_id, user_role, filters, duration_ms, rows_returned
            )
            VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)
          `,
          [
            body.data.operating_company_id,
            body.data.report_id,
            body.data.report_name ?? reportMeta?.name ?? body.data.report_id,
            user.uuid,
            user.role,
            JSON.stringify(body.data.filters ?? {}),
            body.data.duration_ms ?? null,
            body.data.rows_returned ?? null,
          ]
        );
      });
    } catch (error) {
      req.log.warn({ err: error }, "reports.run-log insert failed (best effort)");
    }

    return { ok: true };
  });
}
