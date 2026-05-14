import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { currentAuthUser, validationError, withCompanyScope } from "../accounting/shared.js";
import { computeNextRunAt, scheduleInputFromDbRow, type ScheduleFrequency } from "./next-run.js";
import { appendReportingAuditEvent } from "./reporting-audit.js";
import { deliverScheduledReportToEmail } from "./report-delivery.js";

function accountingRoles(role: string) {
  return ["Owner", "Administrator", "Accountant"].includes(role);
}

const frequencySchema = z.object({
  kind: z.enum(["daily", "weekly", "monthly", "cron"]),
  time_local: z.string().regex(/^\d{1,2}:\d{2}$/),
  day_of_week: z.number().int().min(0).max(6).optional(),
  day_of_month: z.number().int().min(1).max(31).optional(),
  cron: z.string().max(200).optional(),
});

const createBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  report_id: z.string().min(1).max(200),
  name: z.string().trim().max(200).optional(),
  parameters: z.record(z.string(), z.any()).default({}),
  frequency: frequencySchema,
  recipients: z.array(z.string().email()).min(1),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  format: z.enum(["pdf", "xlsx", "csv"]).default("pdf"),
  subject_template: z.string().min(1).max(500),
  timezone: z.string().trim().min(1).max(120).optional(),
});

const patchBodySchema = createBodySchema.partial().extend({
  operating_company_id: z.string().uuid(),
});

const companyBodySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const listQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  status: z.enum(["active", "paused", "failed", "draft"]).optional(),
});

const detailQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

function displayNameFromParams(reportParams: unknown): string | null {
  if (!reportParams || typeof reportParams !== "object") return null;
  const o = reportParams as Record<string, unknown>;
  if (typeof o.display_name === "string" && o.display_name.trim()) return o.display_name.trim();
  if (typeof o.name === "string" && o.name.trim()) return o.name.trim();
  return null;
}

function cadenceLabel(row: {
  frequency: string;
  run_time: string | null;
  run_day_of_week: number | null;
  run_day_of_month: number | null;
  cron_expression: string | null;
}) {
  const t = row.run_time ? String(row.run_time).slice(0, 5) : "06:00";
  if (row.frequency === "daily") return `Daily @ ${t}`;
  if (row.frequency === "weekly") return `Weekly (dow ${row.run_day_of_week ?? "?"}) @ ${t}`;
  if (row.frequency === "monthly") return `Monthly (dom ${row.run_day_of_month ?? "?"}) @ ${t}`;
  return `Cron ${row.cron_expression ?? ""}`;
}

function mapRow(row: Record<string, unknown>) {
  const reportParams = row.report_params;
  const recipients = Array.isArray(row.recipients_to) ? (row.recipients_to as string[]) : [];
  const status = String(row.status ?? "");
  const listStatus = status === "draft" ? "paused" : status === "failed" ? "failed" : status === "paused" ? "paused" : "active";
  return {
    id: String(row.id),
    report_id: String(row.report_id),
    name: displayNameFromParams(reportParams) ?? String(row.report_id),
    cadence_label: cadenceLabel({
      frequency: String(row.frequency ?? ""),
      run_time: row.run_time ? String(row.run_time) : null,
      run_day_of_week:
        typeof row.run_day_of_week === "number" ? row.run_day_of_week : row.run_day_of_week != null ? Number(row.run_day_of_week) : null,
      run_day_of_month:
        typeof row.run_day_of_month === "number" ? row.run_day_of_month : row.run_day_of_month != null ? Number(row.run_day_of_month) : null,
      cron_expression: row.cron_expression ? String(row.cron_expression) : null,
    }),
    recipients: recipients.join(", "),
    last_run_at: row.last_run_at ? new Date(String(row.last_run_at)).toISOString() : null,
    next_run_at: row.next_run_at ? new Date(String(row.next_run_at)).toISOString() : null,
    status: listStatus as "active" | "paused" | "failed",
  };
}

export async function registerScheduledReportsRoutes(app: FastifyInstance) {
  app.get("/api/v1/scheduled-reports", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!accountingRoles(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const parsed = listQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const rows = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
      const exists = await client.query(`SELECT to_regclass('reporting.scheduled_reports') IS NOT NULL AS ok`);
      if (!exists.rows[0]?.ok) return [];

      const values: unknown[] = [parsed.data.operating_company_id];
      const where = [`operating_company_id = $1`];
      if (parsed.data.status) {
        values.push(parsed.data.status);
        where.push(`status = $${values.length}`);
      }

      const res = await client.query(
        `
          SELECT *
          FROM reporting.scheduled_reports
          WHERE ${where.join(" AND ")}
          ORDER BY created_at DESC
        `,
        values
      );
      return res.rows.map((r: Record<string, unknown>) => mapRow(r));
    });

    return { rows };
  });

  app.get("/api/v1/scheduled-reports/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!accountingRoles(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const params = z.object({ id: z.string().uuid() }).safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);

    const parsed = detailQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const payload = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
      const exists = await client.query(`SELECT to_regclass('reporting.scheduled_reports') IS NOT NULL AS ok`);
      if (!exists.rows[0]?.ok) return null;

      const rowRes = await client.query(`SELECT * FROM reporting.scheduled_reports WHERE id = $1`, [params.data.id]);
      const row = rowRes.rows[0] as Record<string, unknown> | undefined;
      if (!row) return null;

      const runsRes = await client.query(
        `
          SELECT id, run_at, status, duration_ms, generated_file_r2_path, file_size_bytes, email_queue_id, error_message, created_at
          FROM reporting.scheduled_report_runs
          WHERE scheduled_report_id = $1
          ORDER BY run_at DESC
          LIMIT 50
        `,
        [params.data.id]
      );

      return { record: row, runs: runsRes.rows };
    });

    if (!payload) return reply.code(404).send({ error: "scheduled_reports_unavailable" });
    if (!payload.record) return reply.code(404).send({ error: "not_found" });
    return payload;
  });

  app.post("/api/v1/scheduled-reports", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!accountingRoles(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const parsed = createBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const timezone = parsed.data.timezone ?? "America/Chicago";
    const frequency = parsed.data.frequency.kind;
    const cron_expression = frequency === "cron" ? parsed.data.frequency.cron ?? null : null;
    const run_day_of_week = frequency === "weekly" ? parsed.data.frequency.day_of_week ?? 1 : null;
    const run_day_of_month = frequency === "monthly" ? parsed.data.frequency.day_of_month ?? 1 : null;

    const reportParams = {
      ...parsed.data.parameters,
      ...(parsed.data.name ? { display_name: parsed.data.name } : {}),
    };

    const nextRunAt = computeNextRunAt(
      {
        frequency,
        run_time: parsed.data.frequency.time_local,
        run_day_of_week,
        run_day_of_month,
        cron_expression,
        timezone,
      },
      new Date()
    );

    const insertedId = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
      const exists = await client.query(`SELECT to_regclass('reporting.scheduled_reports') IS NOT NULL AS ok`);
      if (!exists.rows[0]?.ok) return null;

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
            $1,$2,$3::jsonb,$4,$5,$6::time,$7,$8,$9,$10::text[],$11::text[],$12::text[],$13,$14,'active',$15,$16
          )
          RETURNING id
        `,
        [
          parsed.data.operating_company_id,
          parsed.data.report_id,
          JSON.stringify(reportParams),
          frequency,
          cron_expression,
          `${parsed.data.frequency.time_local}:00`,
          run_day_of_week,
          run_day_of_month,
          timezone,
          parsed.data.recipients,
          parsed.data.cc ?? null,
          parsed.data.bcc ?? null,
          parsed.data.subject_template,
          parsed.data.format,
          user.uuid,
          nextRunAt,
        ]
      );
      return res.rows[0]?.id ? String(res.rows[0].id) : null;
    });

    if (!insertedId) return reply.code(503).send({ error: "scheduled_reports_unavailable" });

    await appendReportingAuditEvent(
      "scheduled_report.created",
      "info",
      {
        scheduled_report_id: insertedId,
        operating_company_id: parsed.data.operating_company_id,
        report_id: parsed.data.report_id,
      },
      user.uuid
    );

    return { id: insertedId };
  });

  app.patch("/api/v1/scheduled-reports/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!accountingRoles(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const params = z.object({ id: z.string().uuid() }).safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);

    const parsed = patchBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const updated = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
      const exists = await client.query(`SELECT to_regclass('reporting.scheduled_reports') IS NOT NULL AS ok`);
      if (!exists.rows[0]?.ok) return false;

      const curRes = await client.query(`SELECT * FROM reporting.scheduled_reports WHERE id = $1`, [params.data.id]);
      const cur = curRes.rows[0] as Record<string, unknown> | undefined;
      if (!cur) return false;

      const mergedTimezone = parsed.data.timezone ?? String(cur.timezone ?? "America/Chicago");
      const mergedFreq = (parsed.data.frequency?.kind ?? String(cur.frequency ?? "daily")) as ScheduleFrequency;
      const mergedTimeLocal = parsed.data.frequency?.time_local ?? (cur.run_time ? String(cur.run_time).slice(0, 5) : "06:00");
      const mergedCron =
        mergedFreq === "cron" ? parsed.data.frequency?.cron ?? (cur.cron_expression ? String(cur.cron_expression) : null) : null;
      const mergedDow =
        mergedFreq === "weekly"
          ? parsed.data.frequency?.day_of_week ??
            (typeof cur.run_day_of_week === "number" ? cur.run_day_of_week : cur.run_day_of_week != null ? Number(cur.run_day_of_week) : 1)
          : null;
      const mergedDom =
        mergedFreq === "monthly"
          ? parsed.data.frequency?.day_of_month ??
            (typeof cur.run_day_of_month === "number" ? cur.run_day_of_month : cur.run_day_of_month != null ? Number(cur.run_day_of_month) : 1)
          : null;

      let reportParams = cur.report_params;
      if (parsed.data.parameters || parsed.data.name) {
        const base = (typeof cur.report_params === "object" && cur.report_params ? cur.report_params : {}) as Record<string, unknown>;
        reportParams = { ...base, ...(parsed.data.parameters ?? {}) };
        if (parsed.data.name) Object.assign(reportParams as object, { display_name: parsed.data.name });
      }

      const scheduleChanged = Boolean(parsed.data.frequency || parsed.data.timezone);
      const nextRunAt =
        String(cur.status) === "active" && scheduleChanged
          ? computeNextRunAt(
              {
                frequency: mergedFreq,
                run_time: mergedTimeLocal,
                run_day_of_week: mergedDow,
                run_day_of_month: mergedDom,
                cron_expression: mergedCron,
                timezone: mergedTimezone,
              },
              new Date()
            )
          : null;

      const fragments: string[] = [];
      const values: unknown[] = [];

      const push = (exprTemplate: string, val: unknown) => {
        values.push(val);
        fragments.push(exprTemplate.replace("$$", `$${values.length}`));
      };

      if (parsed.data.report_id) push(`report_id = $$`, parsed.data.report_id);
      if (parsed.data.parameters || parsed.data.name) push(`report_params = $$::jsonb`, JSON.stringify(reportParams));

      if (parsed.data.frequency) {
        push(`frequency = $$`, mergedFreq);
        push(`cron_expression = $$`, mergedCron);
        push(`run_time = $$::time`, `${mergedTimeLocal}:00`);
        push(`run_day_of_week = $$`, mergedDow);
        push(`run_day_of_month = $$`, mergedDom);
      }

      if (parsed.data.timezone) push(`timezone = $$`, mergedTimezone);
      if (parsed.data.recipients) push(`recipients_to = $$::text[]`, parsed.data.recipients);
      if (parsed.data.cc !== undefined) push(`recipients_cc = $$::text[]`, parsed.data.cc ?? null);
      if (parsed.data.bcc !== undefined) push(`recipients_bcc = $$::text[]`, parsed.data.bcc ?? null);
      if (parsed.data.subject_template) push(`subject_template = $$`, parsed.data.subject_template);
      if (parsed.data.format) push(`format = $$`, parsed.data.format);

      if (nextRunAt) push(`next_run_at = $$`, nextRunAt);

      if (fragments.length === 0) return true;

      values.push(params.data.id);
      await client.query(
        `
          UPDATE reporting.scheduled_reports
          SET ${fragments.join(", ")}, updated_at = now()
          WHERE id = $${values.length}
        `,
        values
      );
      return true;
    });

    if (!updated) return reply.code(404).send({ error: "not_found" });

    await appendReportingAuditEvent(
      "scheduled_report.updated",
      "info",
      {
        scheduled_report_id: params.data.id,
        operating_company_id: parsed.data.operating_company_id,
      },
      user.uuid
    );

    return { ok: true as const };
  });

  app.post("/api/v1/scheduled-reports/:id/pause", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!accountingRoles(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const params = z.object({ id: z.string().uuid() }).safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);

    const body = companyBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const ok = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
      const exists = await client.query(`SELECT to_regclass('reporting.scheduled_reports') IS NOT NULL AS ok`);
      if (!exists.rows[0]?.ok) return false;
      const res = await client.query(
        `
          UPDATE reporting.scheduled_reports
          SET status='paused', next_run_at=NULL, updated_at=now()
          WHERE id=$1
          RETURNING id
        `,
        [params.data.id]
      );
      return Boolean(res.rows[0]?.id);
    });

    if (!ok) return reply.code(404).send({ error: "not_found" });

    await appendReportingAuditEvent(
      "scheduled_report.paused",
      "info",
      {
        scheduled_report_id: params.data.id,
        operating_company_id: body.data.operating_company_id,
      },
      user.uuid
    );

    return { ok: true as const };
  });

  app.post("/api/v1/scheduled-reports/:id/resume", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!accountingRoles(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const params = z.object({ id: z.string().uuid() }).safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);

    const body = companyBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const ok = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
      const exists = await client.query(`SELECT to_regclass('reporting.scheduled_reports') IS NOT NULL AS ok`);
      if (!exists.rows[0]?.ok) return false;

      const curRes = await client.query(`SELECT * FROM reporting.scheduled_reports WHERE id=$1`, [params.data.id]);
      const cur = curRes.rows[0] as Record<string, unknown> | undefined;
      if (!cur) return false;

      const nextRunAt = computeNextRunAt(scheduleInputFromDbRow(cur), new Date());

      const res = await client.query(
        `
          UPDATE reporting.scheduled_reports
          SET status='active',
              next_run_at=$2,
              updated_at=now(),
              failure_count=0,
              last_run_status=NULL,
              last_run_error=NULL
          WHERE id=$1 AND status <> 'draft'
          RETURNING id
        `,
        [params.data.id, nextRunAt]
      );
      return Boolean(res.rows[0]?.id);
    });

    if (!ok) return reply.code(404).send({ error: "not_found" });

    await appendReportingAuditEvent(
      "scheduled_report.resumed",
      "info",
      {
        scheduled_report_id: params.data.id,
        operating_company_id: body.data.operating_company_id,
      },
      user.uuid
    );

    return { ok: true as const };
  });

  app.post("/api/v1/scheduled-reports/:id/send-now", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!accountingRoles(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const params = z.object({ id: z.string().uuid() }).safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);

    const body = companyBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const bumped = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
      const exists = await client.query(`SELECT to_regclass('reporting.scheduled_reports') IS NOT NULL AS ok`);
      if (!exists.rows[0]?.ok) return false;

      const res = await client.query(
        `
          UPDATE reporting.scheduled_reports
          SET next_run_at = now(), updated_at = now(), status = CASE WHEN status='paused' THEN status ELSE 'active' END
          WHERE id=$1 AND status IN ('active','paused','failed')
          RETURNING id
        `,
        [params.data.id]
      );
      return Boolean(res.rows[0]?.id);
    });

    if (!bumped) return reply.code(404).send({ error: "not_found" });

    await appendReportingAuditEvent(
      "scheduled_report.run_now_triggered",
      "info",
      {
        scheduled_report_id: params.data.id,
        operating_company_id: body.data.operating_company_id,
      },
      user.uuid
    );

    return { ok: true as const };
  });

  app.delete("/api/v1/scheduled-reports/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!accountingRoles(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const params = z.object({ id: z.string().uuid() }).safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);

    const parsed = detailQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const deleted = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
      const exists = await client.query(`SELECT to_regclass('reporting.scheduled_reports') IS NOT NULL AS ok`);
      if (!exists.rows[0]?.ok) return false;
      const res = await client.query(`DELETE FROM reporting.scheduled_reports WHERE id=$1 RETURNING id`, [params.data.id]);
      return Boolean(res.rows[0]?.id);
    });

    if (!deleted) return reply.code(404).send({ error: "not_found" });

    await appendReportingAuditEvent(
      "scheduled_report.deleted",
      "info",
      {
        scheduled_report_id: params.data.id,
        operating_company_id: parsed.data.operating_company_id,
      },
      user.uuid
    );

    return { ok: true as const };
  });

  app.post("/api/v1/scheduled-reports/test-send", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!accountingRoles(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const parsed = createBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    try {
      const timezone = parsed.data.timezone ?? "America/Chicago";
      const result = await deliverScheduledReportToEmail({
        operatingCompanyId: parsed.data.operating_company_id,
        reportId: parsed.data.report_id,
        format: parsed.data.format,
        recipientsTo: parsed.data.recipients,
        cc: parsed.data.cc ?? null,
        bcc: parsed.data.bcc ?? null,
        subjectTemplate: parsed.data.subject_template,
        timezone,
        frequency: parsed.data.frequency.kind,
        actorUserId: user.uuid,
        pathSegment: "test-send",
      });

      await appendReportingAuditEvent(
        "scheduled_report.test_sent",
        "info",
        {
          operating_company_id: parsed.data.operating_company_id,
          report_id: parsed.data.report_id,
          email_queue_id: result.email_queue_id,
        },
        user.uuid
      );

      return { ok: true as const, ...result };
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown_error";
      if (message.startsWith("unsupported_report_id")) return reply.code(400).send({ error: "unsupported_report" });
      if (message.startsWith("r2_not_configured")) return reply.code(503).send({ error: "r2_not_configured" });
      app.log.error({ err }, "[scheduled-reports] test-send failed");
      return reply.code(500).send({ error: "test_send_failed" });
    }
  });
}
