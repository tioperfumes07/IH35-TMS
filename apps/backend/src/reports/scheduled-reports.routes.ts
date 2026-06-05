import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import { REPORT_LIBRARY } from "./shared.js";
import { runScheduledReport, type ScheduledReportId } from "./scheduled-report-runner.js";

const VALID_REPORT_IDS = [
  "dispatch-board",
  "cash-position-ar",
  "profit-per-truck-week",
  "settlements-ready",
  "maintenance-open-wos",
  "ifta-quarterly-state",
] as const;

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const createBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  report_id: z.enum(VALID_REPORT_IDS),
  name: z.string().trim().min(1).max(200).optional(),
  cadence: z.enum(["daily", "weekly", "monthly", "quarterly"]),
  cadence_detail: z.string().trim().max(200).optional(),
  send_at_local_time: z.string().regex(/^\d{1,2}:\d{2}$/).optional(),
  recipient_roles: z.array(z.string().trim().min(1)).min(1),
  recipient_emails: z.array(z.string().email()).optional(),
  params: z.record(z.string(), z.unknown()).optional(),
});

const patchBodySchema = createBodySchema.partial().extend({
  operating_company_id: z.string().uuid(),
  enabled: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

const idParamsSchema = z.object({
  id: z.string().uuid(),
});

function accountingRoles(role: string) {
  return ["Owner", "Administrator", "Accountant"].includes(role);
}

function mapRow(row: Record<string, unknown>) {
  const reportName = REPORT_LIBRARY.find((item) => item.id === row.report_id)?.name ?? String(row.report_id);
  const recipientRoles = Array.isArray(row.recipient_roles) ? (row.recipient_roles as string[]).join(", ") : "";
  const recipientEmails = Array.isArray(row.recipient_emails) ? (row.recipient_emails as string[]).join(", ") : "";
  const recipients = [recipientRoles, recipientEmails].filter(Boolean).join(" · ") || "—";
  return {
    id: String(row.id),
    report_id: String(row.report_id),
    name: row.name ? String(row.name) : reportName,
    cadence: String(row.cadence),
    cadence_detail: row.cadence_detail ? String(row.cadence_detail) : null,
    cadence_label: row.cadence_detail ? String(row.cadence_detail) : String(row.cadence),
    recipients,
    send_at_local_time: row.send_at_local_time ? String(row.send_at_local_time).slice(0, 5) : "07:00",
    enabled: Boolean(row.enabled),
    is_active: row.is_active !== false,
    last_sent_at: row.last_sent_at ? new Date(String(row.last_sent_at)).toISOString() : null,
    next_due_at: row.next_due_at ? new Date(String(row.next_due_at)).toISOString() : null,
  };
}

export async function registerReportsScheduledCrudRoutes(app: FastifyInstance) {
  app.post("/api/v1/reports/scheduled", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!accountingRoles(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const parsed = createBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const row = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          INSERT INTO reports.scheduled_reports (
            operating_company_id, report_id, name, cadence, cadence_detail,
            send_at_local_time, recipient_roles, recipient_emails, params,
            enabled, is_active, next_due_at
          )
          VALUES ($1::uuid, $2, $3, $4, $5, $6::time, $7, $8, $9::jsonb, true, true, now())
          RETURNING *
        `,
        [
          parsed.data.operating_company_id,
          parsed.data.report_id,
          parsed.data.name ?? null,
          parsed.data.cadence,
          parsed.data.cadence_detail ?? null,
          parsed.data.send_at_local_time ?? "07:00",
          parsed.data.recipient_roles,
          parsed.data.recipient_emails ?? [],
          JSON.stringify(parsed.data.params ?? {}),
        ]
      );
      return res.rows[0];
    });

    return reply.code(201).send(mapRow(row));
  });

  app.patch("/api/v1/reports/scheduled/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!accountingRoles(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const parsed = patchBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const row = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
      const sets: string[] = [];
      const values: unknown[] = [params.data.id, parsed.data.operating_company_id];
      const push = (col: string, val: unknown) => {
        values.push(val);
        sets.push(`${col} = $${values.length}`);
      };

      if (parsed.data.report_id) push("report_id", parsed.data.report_id);
      if (parsed.data.name !== undefined) push("name", parsed.data.name);
      if (parsed.data.cadence) push("cadence", parsed.data.cadence);
      if (parsed.data.cadence_detail !== undefined) push("cadence_detail", parsed.data.cadence_detail);
      if (parsed.data.send_at_local_time) push("send_at_local_time", parsed.data.send_at_local_time);
      if (parsed.data.recipient_roles) push("recipient_roles", parsed.data.recipient_roles);
      if (parsed.data.recipient_emails) push("recipient_emails", parsed.data.recipient_emails);
      if (parsed.data.params) push("params", JSON.stringify(parsed.data.params));
      if (parsed.data.enabled !== undefined) push("enabled", parsed.data.enabled);
      if (parsed.data.is_active !== undefined) push("is_active", parsed.data.is_active);

      if (sets.length === 0) return null;

      const res = await client.query(
        `
          UPDATE reports.scheduled_reports
          SET ${sets.join(", ")}
          WHERE id = $1::uuid AND operating_company_id = $2::uuid
          RETURNING *
        `,
        values
      );
      return res.rows[0] ?? null;
    });

    if (!row) return reply.code(404).send({ error: "not_found" });
    return mapRow(row);
  });

  app.delete("/api/v1/reports/scheduled/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!accountingRoles(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const deleted = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `DELETE FROM reports.scheduled_reports WHERE id = $1::uuid AND operating_company_id = $2::uuid RETURNING id`,
        [params.data.id, query.data.operating_company_id]
      );
      return Boolean(res.rows[0]?.id);
    });

    if (!deleted) return reply.code(404).send({ error: "not_found" });
    return { ok: true };
  });

  app.post("/api/v1/reports/scheduled/:id/test-send", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!accountingRoles(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `SELECT report_id, recipient_roles FROM reports.scheduled_reports WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
        [params.data.id, query.data.operating_company_id]
      );
      const row = res.rows[0];
      if (!row) return { code: 404 as const };

      const out = await runScheduledReport({
        reportId: String(row.report_id) as ScheduledReportId,
        operatingCompanyId: query.data.operating_company_id,
        recipientRoles: Array.isArray(row.recipient_roles) ? (row.recipient_roles as string[]) : [],
        trigger: "manual",
        actorUserId: user.uuid,
      });
      return { code: 200 as const, data: out };
    });

    if (result.code === 404) return reply.code(404).send({ error: "not_found" });
    return result.data;
  });
}
