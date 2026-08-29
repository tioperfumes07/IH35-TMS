import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  state: z.enum(["open", "acknowledged", "scheduled", "dismissed"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const alertParamsSchema = z.object({
  id: z.string().uuid(),
});

const scheduleBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  work_order_id: z.string().uuid(),
});

const ackBodySchema = z.object({
  operating_company_id: z.string().uuid(),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return reply;
  return req.user;
}

function validationError(reply: FastifyReply, err: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: err.flatten() });
}

async function withCompany<T>(userId: string, companyId: string, fn: (client: any) => Promise<T>) {
  await assertCompanyMembership(userId, companyId);
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [companyId]);
    return fn(client);
  });
}

async function relationExists(client: any, relation: string): Promise<boolean> {
  const res = await client.query(`SELECT to_regclass($1) IS NOT NULL AS ok`, [relation]);
  return Boolean(res.rows[0]?.ok);
}

export async function registerMaintenancePmAlertsRoutes(app: FastifyInstance) {
  app.get("/api/v1/maintenance/pm-alerts", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const result = await withCompany(user.uuid, query.data.operating_company_id, async (client) => {
      if (!(await relationExists(client, "maintenance.pm_alerts"))) return { alerts: [], total_count: 0 };

      const values: unknown[] = [query.data.operating_company_id];
      const filters = [`a.operating_company_id = $1::uuid`];
      if (query.data.state) {
        values.push(query.data.state);
        filters.push(`a.state = $${values.length}`);
      } else {
        filters.push(`a.state = 'open'`);
      }

      const count = await client.query(
        `SELECT COUNT(*)::int AS total_count
           FROM maintenance.pm_alerts a
          WHERE ${filters.join(" AND ")}`,
        values
      );
      const rangeValues = [...values, query.data.limit, query.data.offset];
      const limitParameter = rangeValues.length - 1;
      const offsetParameter = rangeValues.length;
      const res = await client.query(
        `
          SELECT
            a.id::text,
            a.unit_id::text,
            COALESCE(u.unit_number, a.unit_id::text) AS unit_number,
            a.pm_schedule_id::text,
            COALESCE(s.label, 'PM schedule') AS schedule_label,
            a.trigger_odometer,
            a.triggered_at::text,
            a.state::text,
            a.scheduled_work_order_id::text,
            wo.display_id AS scheduled_work_order_display_id
          FROM maintenance.pm_alerts a
          LEFT JOIN mdata.units u ON u.id = a.unit_id AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = a.operating_company_id
          LEFT JOIN maintenance.pm_schedules s ON s.id = a.pm_schedule_id
          LEFT JOIN maintenance.work_orders wo ON wo.id = a.scheduled_work_order_id
                                               AND wo.operating_company_id = a.operating_company_id
          WHERE ${filters.join(" AND ")}
          ORDER BY a.triggered_at DESC
          LIMIT $${limitParameter}
          OFFSET $${offsetParameter}
        `,
        rangeValues
      );
      return { alerts: res.rows, total_count: Number(count.rows[0]?.total_count ?? 0) };
    });

    return result;
  });

  app.patch("/api/v1/maintenance/pm-alerts/:id/ack", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = alertParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const body = ackBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const updated = await withCompany(user.uuid, body.data.operating_company_id, async (client) => {
      if (!(await relationExists(client, "maintenance.pm_alerts"))) return null;
      const res = await client.query(
        `
          UPDATE maintenance.pm_alerts
          SET state = 'acknowledged',
              acknowledged_by_user_uuid = $3::uuid
          WHERE id = $1::uuid
            AND operating_company_id = $2::uuid
            AND state = 'open'
          RETURNING id::text
        `,
        [params.data.id, body.data.operating_company_id, user.uuid]
      );
      if (res.rows.length === 0) return null;

      await appendCrudAudit(
        client,
        user.uuid,
        "maintenance.pm_alert.acknowledged",
        {
          resource_type: "maintenance.pm_alerts",
          resource_id: params.data.id,
          operating_company_id: body.data.operating_company_id,
        },
        "info"
      );
      return { ok: true };
    });

    if (!updated) return reply.code(404).send({ error: "pm_alert_not_found" });
    return updated;
  });

  app.patch("/api/v1/maintenance/pm-alerts/:id/schedule", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = alertParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const body = scheduleBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const updated = await withCompany(user.uuid, body.data.operating_company_id, async (client) => {
      if (!(await relationExists(client, "maintenance.pm_alerts"))) return null;
      const alert = await client.query(
        `SELECT unit_id::text
           FROM maintenance.pm_alerts
          WHERE id = $1::uuid
            AND operating_company_id = $2::uuid
            AND state IN ('open', 'acknowledged')
          FOR UPDATE`,
        [params.data.id, body.data.operating_company_id]
      );
      if (alert.rows.length === 0) return null;

      const workOrder = await client.query(
        `SELECT unit_id::text
           FROM maintenance.work_orders
          WHERE id = $1::uuid
            AND operating_company_id = $2::uuid`,
        [body.data.work_order_id, body.data.operating_company_id]
      );
      if (workOrder.rows.length === 0) return { error: "work_order_not_found_for_company" as const };
      if (alert.rows[0]?.unit_id && workOrder.rows[0]?.unit_id !== alert.rows[0].unit_id) {
        return { error: "work_order_unit_mismatch" as const };
      }

      const res = await client.query(
        `
          UPDATE maintenance.pm_alerts
          SET state = 'scheduled',
              scheduled_work_order_id = $3::uuid,
              acknowledged_by_user_uuid = COALESCE(acknowledged_by_user_uuid, $4::uuid)
          WHERE id = $1::uuid
            AND operating_company_id = $2::uuid
            AND state IN ('open', 'acknowledged')
          RETURNING id::text
        `,
        [params.data.id, body.data.operating_company_id, body.data.work_order_id, user.uuid]
      );
      if (res.rows.length === 0) return null;

      await appendCrudAudit(
        client,
        user.uuid,
        "maintenance.pm_alert.scheduled",
        {
          resource_type: "maintenance.pm_alerts",
          resource_id: params.data.id,
          operating_company_id: body.data.operating_company_id,
          scheduled_work_order_id: body.data.work_order_id,
        },
        "info"
      );
      return { ok: true };
    });

    if (!updated) return reply.code(404).send({ error: "pm_alert_not_found" });
    if ("error" in updated) return reply.code(400).send(updated);
    return updated;
  });
}
