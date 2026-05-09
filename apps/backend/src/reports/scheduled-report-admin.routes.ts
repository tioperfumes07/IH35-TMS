import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { runScheduledReport, type ScheduledReportId } from "./scheduled-report-runner.js";

const bodySchema = z.object({
  report_id: z.enum([
    "dispatch-board",
    "cash-position-ar",
    "profit-per-truck-week",
    "settlements-ready",
    "maintenance-open-wos",
    "ifta-quarterly-state",
  ]),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user as { uuid: string; role: string };
}

export async function registerScheduledReportAdminRoutes(app: FastifyInstance) {
  app.post("/api/v1/admin/run-scheduled-report", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (user.role !== "Owner") return reply.code(403).send({ error: "forbidden" });

    const parsed = bodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    const reportId = parsed.data.report_id as ScheduledReportId;

    const companyAndRoles = await withCurrentUser(user.uuid, async (client) => {
      const companyRes = await client.query(
        `
          SELECT c.id
          FROM identity.users u
          JOIN org.companies c ON c.id = u.default_company_id
          WHERE u.id = $1
            AND c.deactivated_at IS NULL
          UNION
          SELECT c.id
          FROM org.companies c
          WHERE c.id IN (SELECT org.user_accessible_company_ids())
          ORDER BY id
          LIMIT 1
        `,
        [user.uuid]
      );
      const operatingCompanyId = (companyRes.rows[0]?.id as string | undefined) ?? null;
      if (!operatingCompanyId) return null;

      await client.query("SELECT set_config('app.operating_company_id', $1, true)", [operatingCompanyId]);
      const scheduleRes = await client.query(
        `
          SELECT recipient_roles
          FROM reports.scheduled_reports
          WHERE operating_company_id = $1
            AND report_id = $2
            AND enabled = true
          LIMIT 1
        `,
        [operatingCompanyId, reportId]
      );
      const roles = (scheduleRes.rows[0]?.recipient_roles as string[] | undefined) ?? ["Owner"];
      return { operatingCompanyId, roles };
    });

    if (!companyAndRoles) return reply.code(400).send({ error: "operating_company_not_found" });

    const result = await runScheduledReport({
      reportId,
      operatingCompanyId: companyAndRoles.operatingCompanyId,
      recipientRoles: companyAndRoles.roles,
      trigger: "manual",
      actorUserId: user.uuid,
    });

    await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, $4::uuid, $5)`, [
        "scheduled_report.manual_run",
        "info",
        JSON.stringify({
          report_id: reportId,
          operating_company_id: companyAndRoles.operatingCompanyId,
          status: result.status,
          email_id: result.email_id,
        }),
        user.uuid,
        "P3-T11.16.3-SCHEDULED-REPORTS",
      ]);
    });

    return reply.send(result);
  });
}

