import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  unit_id: z.string().uuid().optional(),
  pm_type: z.string().trim().optional(),
  status: z.enum(["all", "current", "due_soon", "overdue"]).optional().default("all"),
});

const createSchema = z.object({
  operating_company_id: z.string().uuid(),
  unit_id: z.string().uuid(),
  pm_type: z.string().trim().min(2).max(120),
  interval_kind: z.enum(["miles", "hours", "days"]),
  interval_value: z.number().int().positive(),
  last_performed_at: z.string().optional(),
  last_service_odometer: z.number().int().nonnegative().optional(),
  notes: z.string().trim().max(2000).optional(),
});

const idSchema = z.object({ id: z.string().uuid() });

const dueSoonConfig = {
  days: Number(process.env.MAINT_PM_DUE_SOON_DAYS ?? "14"),
  miles: Number(process.env.MAINT_PM_DUE_SOON_MILES ?? "500"),
  hours: Number(process.env.MAINT_PM_DUE_SOON_HOURS ?? "20"),
};

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

function classifyPmStatus(nextDueOdometer: number | null, nowOdometer: number | null) {
  if (nextDueOdometer == null || nowOdometer == null) return "current";
  const delta = nextDueOdometer - nowOdometer;
  if (delta < 0) return "overdue";
  if (delta <= dueSoonConfig.miles) return "due_soon";
  return "current";
}

export async function registerMaintenancePmScheduleRoutes(app: FastifyInstance) {
  app.get("/api/v1/maintenance/pm-schedule", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const q = parsed.data;

    const rows = await withCompany(user.uuid, q.operating_company_id, async (client) => {
      const values: unknown[] = [q.operating_company_id];
      const filters = ["s.operating_company_id = $1", "s.is_active = true"];
      if (q.unit_id) {
        values.push(q.unit_id);
        filters.push(`s.unit_id = $${values.length}`);
      }
      if (q.pm_type) {
        values.push(`%${q.pm_type}%`);
        filters.push(`s.label ILIKE $${values.length}`);
      }
      const res = await client.query(
        `
          SELECT
            s.id::text,
            s.unit_id::text,
            COALESCE(u.unit_number, s.unit_id::text) AS unit_display_id,
            s.label AS pm_type,
            s.interval_kind,
            s.interval_value,
            s.last_service_odometer,
            s.next_due_odometer,
            s.created_at::text
          FROM maintenance.pm_schedules s
          LEFT JOIN mdata.units u ON u.id = s.unit_id
          WHERE ${filters.join(" AND ")}
          ORDER BY COALESCE(s.next_due_odometer, 2147483647) ASC, s.created_at DESC
        `,
        values
      );
      return res.rows.map((row: Record<string, unknown>) => ({
        ...row,
        status: classifyPmStatus(
          row.next_due_odometer == null ? null : Number(row.next_due_odometer),
          row.last_service_odometer == null ? null : Number(row.last_service_odometer)
        ),
      }));
    });

    const filtered =
      q.status === "all" ? rows : rows.filter((row: Record<string, unknown>) => String(row.status) === q.status);
    return { rows: filtered, due_soon_threshold: dueSoonConfig };
  });

  app.post("/api/v1/maintenance/pm-schedule", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = createSchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const body = parsed.data;

    const created = await withCompany(user.uuid, body.operating_company_id, async (client) => {
      const nextDue = body.last_service_odometer != null ? body.last_service_odometer + body.interval_value : null;
      const res = await client.query(
        `
          INSERT INTO maintenance.pm_schedules (
            operating_company_id, unit_id, label, interval_kind, interval_value, last_service_odometer, next_due_odometer, created_by_user_uuid
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
          RETURNING id::text, unit_id::text, label AS pm_type, interval_kind, interval_value, last_service_odometer, next_due_odometer
        `,
        [
          body.operating_company_id,
          body.unit_id,
          body.pm_type,
          body.interval_kind,
          body.interval_value,
          body.last_service_odometer ?? null,
          nextDue,
          user.uuid,
        ]
      );
      await appendCrudAudit(client, user.uuid, "maintenance.pm_schedule.created", {
        resource_id: res.rows[0]?.id,
        operating_company_id: body.operating_company_id,
      });
      return res.rows[0];
    });

    return reply.code(201).send(created);
  });

  app.post("/api/v1/maintenance/pm-schedule/:id/generate-wo", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = idSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const result = await withCompany(user.uuid, query.data.operating_company_id, async (client) => {
      const schedule = await client.query(
        `SELECT id, unit_id FROM maintenance.pm_schedules WHERE id = $1 AND operating_company_id = $2 LIMIT 1`,
        [params.data.id, query.data.operating_company_id]
      );
      if (!schedule.rows[0]) return null;
      const wo = await client.query(
        `
          SELECT id::text
          FROM maintenance.work_orders
          WHERE operating_company_id = $1
            AND unit_id = $2
            AND wo_type = 'pm'
          ORDER BY created_at DESC
          LIMIT 1
        `,
        [query.data.operating_company_id, schedule.rows[0].unit_id]
      );
      await appendCrudAudit(client, user.uuid, "maintenance.pm_schedule.generated_wo", {
        resource_id: params.data.id,
        generated_work_order_id: wo.rows[0]?.id ?? "pending",
        operating_company_id: query.data.operating_company_id,
      });
      return { id: wo.rows[0]?.id ?? "pending" };
    });
    if (!result) return reply.code(404).send({ error: "pm_schedule_not_found" });
    return { work_order_id: result.id };
  });
}
