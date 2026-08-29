import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import ExcelJS from "exceljs";
import { z } from "zod";
import { withCurrentUser } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";
import { assertCompanyMembership } from "../../_helpers/company-membership-guard.js";
import { addArrayWorksheet, writeWorkbookBuffer } from "../../lib/exceljs-workbook.js";

const companyQuerySchema = z.object({ operating_company_id: z.string().uuid() });
const reportParamsSchema = z.object({ report_id: z.string().trim().min(1) });

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return reply;
  return req.user;
}

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

type SafetyReportRow = { event_class: string; total: number };

async function withCompanyScope<T>(userId: string, companyId: string, fn: (client: Queryable) => Promise<T>) {
  await assertCompanyMembership(userId, companyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    return fn(client as Queryable);
  });
}

async function fetchSafetyReportRows(client: Queryable, companyId: string): Promise<SafetyReportRow[]> {
  const res = await client.query<SafetyReportRow>(
    `
      SELECT event_class, count(*)::int AS total
      FROM audit.audit_events
      WHERE payload->>'operating_company_id' = $1
        AND event_class ILIKE 'safety.%'
      GROUP BY event_class
      ORDER BY event_class
    `,
    [companyId]
  );
  return res.rows;
}

/** Renders the same company-scoped rollup rows as GET /api/v1/safety/reports/:report_id. Empty → header-only sheet. */
export async function renderSafetyReportXlsx(rows: SafetyReportRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  addArrayWorksheet(workbook, "Safety Report", [
    ["event_class", "total"],
    ...rows.map((row) => [row.event_class, row.total]),
  ]);
  return writeWorkbookBuffer(workbook);
}

export async function registerSafetyReportsRoutes(app: FastifyInstance) {
  // CodeQL js/missing-rate-limiting: authorized report reads must be rate-limited (cf. audit-reports.routes).
  app.get(
    "/api/v1/safety/reports/:report_id",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = authUser(req, reply);
      if (!user) return;
      const query = companyQuerySchema.safeParse(req.query ?? {});
      if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
      const params = reportParamsSchema.safeParse(req.params ?? {});
      if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });

      const rows = await withCompanyScope(user.uuid, query.data.operating_company_id, (client) =>
        fetchSafetyReportRows(client, query.data.operating_company_id)
      );
      return { report_id: params.data.report_id, rows };
    }
  );

  app.get(
    "/api/v1/safety/reports/:report_id/export.xlsx",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = authUser(req, reply);
      if (!user) return;
      const query = companyQuerySchema.safeParse(req.query ?? {});
      if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
      const params = reportParamsSchema.safeParse(req.params ?? {});
      if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });

      const rows = await withCompanyScope(user.uuid, query.data.operating_company_id, (client) =>
        fetchSafetyReportRows(client, query.data.operating_company_id)
      );
      const buffer = await renderSafetyReportXlsx(rows);
      return reply
        .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        .header("Content-Disposition", `attachment; filename="safety-${params.data.report_id}.xlsx"`)
        .send(buffer);
    }
  );
}
