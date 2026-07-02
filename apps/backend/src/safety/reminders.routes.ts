import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { refreshSafetyReminders } from "./reminders.cron.js";

const listQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  status: z.enum(["open", "dismissed", "resolved"]).default("open"),
  severity: z.enum(["warning", "critical", "expired"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

const reminderParamsSchema = z.object({
  id: z.string().uuid(),
});

const patchReminderSchema = z.object({
  status: z.enum(["open", "dismissed", "resolved"]),
});

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function canMutate(role: string) {
  return ["Owner", "Administrator", "Manager", "Safety"].includes(role);
}

async function withCompanyScope<T>(
  userId: string,
  operatingCompanyId: string,
  fn: (client: Queryable) => Promise<T>
) {
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [operatingCompanyId]);
    return fn(client as Queryable);
  });
}

export async function registerSafetyRemindersRoutes(app: FastifyInstance) {
  app.get("/api/v1/safety/reminders", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const query = listQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });

    await refreshSafetyReminders();

    const reminders = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT
            r.id::text,
            r.operating_company_id::text,
            r.driver_id::text,
            CONCAT_WS(' ', d.first_name, d.last_name) AS driver_name,
            r.source_type,
            r.source_id::text,
            r.item_name,
            r.due_date::text,
            r.days_to_expiry,
            r.severity,
            r.status,
            r.last_detected_at::text,
            r.last_notified_at::text,
            r.created_at::text,
            r.updated_at::text
          FROM safety.compliance_reminders r
          LEFT JOIN mdata.drivers d
            ON d.id = r.driver_id
          WHERE r.operating_company_id = $1::uuid
            AND r.status = $2::text
            AND ($3::text IS NULL OR r.severity = $3::text)
          ORDER BY r.days_to_expiry ASC, r.due_date ASC, r.created_at DESC
          LIMIT $4::int
        `,
        [query.data.operating_company_id, query.data.status, query.data.severity ?? null, query.data.limit]
      );
      return res.rows;
    });

    return { reminders };
  });

  app.patch("/api/v1/safety/reminders/:id", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const query = listQuerySchema.pick({ operating_company_id: true }).safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    const params = reminderParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const body = patchReminderSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    const updated = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          UPDATE safety.compliance_reminders
          SET status = $3::text,
              updated_at = now()
          WHERE id = $1::uuid
            AND operating_company_id = $2::uuid
          RETURNING id::text, driver_id::text, source_type, source_id::text, status
        `,
        [params.data.id, query.data.operating_company_id, body.data.status]
      );
      const row = res.rows[0];
      if (!row) return null;

      await appendCrudAudit(
        client,
        user.uuid,
        "safety.reminder.status_updated",
        {
          resource_type: "safety.compliance_reminders",
          resource_id: row.id,
          operating_company_id: query.data.operating_company_id,
          driver_id: row.driver_id ?? null,
          source_type: row.source_type ?? null,
          source_id: row.source_id ?? null,
          status: row.status ?? null,
        },
        "info",
        "P7-SAF-REMINDERS"
      );
      return row;
    });

    if (!updated) return reply.code(404).send({ error: "safety_reminder_not_found" });
    return updated;
  });
}
