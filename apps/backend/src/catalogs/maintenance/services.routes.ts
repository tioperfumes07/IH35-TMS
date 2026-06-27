/**
 * CLOSURE-11 — Maintenance services catalog routes.
 * GET /api/v1/catalogs/maintenance/services-catalog
 * GET /api/v1/maintenance/services/eta?unit_id=
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";
import { calculateServiceEta } from "./eta-calculator.js";

const listQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  search: z.string().trim().max(120).optional(),
  applies_to: z.enum(["truck", "trailer", "reefer", "all"]).optional(),
  category: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const etaQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  unit_id: z.string().uuid(),
});

const idParamSchema = z.object({ id: z.string().uuid() });

const createSchema = z.object({
  operating_company_id: z.string().uuid(),
  service_code: z.string().trim().min(1).max(60),
  service_name: z.string().trim().min(1).max(200),
  service_category: z.string().trim().min(1).max(80),
  applies_to_type: z.enum(["truck", "trailer", "reefer", "all"]).default("all"),
  interval_miles: z.number().int().positive().nullable().optional(),
  interval_months: z.number().int().positive().nullable().optional(),
  interval_hours: z.number().int().positive().nullable().optional(),
  is_safety_critical: z.boolean().default(false),
  typical_duration_hours: z.number().nonnegative().nullable().optional(),
  typical_cost_cents: z.number().int().nonnegative().default(0),
  compliance_ref: z.string().trim().max(120).nullable().optional(),
  is_active: z.boolean().default(true),
});

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

async function withCompany<T>(userId: string, companyId: string, fn: (client: { query: <R = Record<string, unknown>>(sql: string, vals?: unknown[]) => Promise<{ rows: R[] }> }) => Promise<T>) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${companyId}'`);
    return fn(client as Parameters<typeof fn>[0]);
  });
}

export async function registerMaintenanceServicesCatalogRoutes(app: FastifyInstance) {
  app.get("/api/v1/catalogs/maintenance/services-catalog", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const parsed = listQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    const q = parsed.data;
    const offset = (q.page - 1) * q.limit;

    return withCompany(user.uuid, q.operating_company_id, async (client) => {
      const values: unknown[] = [q.operating_company_id];
      const where = ["operating_company_id = $1"];
      if (q.search) { values.push(`%${q.search}%`); where.push(`(service_code ILIKE $${values.length} OR service_name ILIKE $${values.length})`); }
      if (q.applies_to) { values.push(q.applies_to); where.push(`(applies_to_type = $${values.length} OR applies_to_type = 'all')`); }
      if (q.category) { values.push(q.category); where.push(`service_category = $${values.length}`); }

      const countRes = await client.query<{ total: string }>(`SELECT count(*)::text AS total FROM mdata.maintenance_services WHERE ${where.join(" AND ")}`, values);
      values.push(q.limit, offset);
      const rowsRes = await client.query(
        `SELECT * FROM mdata.maintenance_services WHERE ${where.join(" AND ")} ORDER BY service_category ASC, service_name ASC LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values
      );
      return { rows: rowsRes.rows, total: Number((countRes.rows[0] as { total?: string } | undefined)?.total ?? 0), page: q.page, limit: q.limit };
    });
  });

  app.get("/api/v1/maintenance/services/eta", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const parsed = etaQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    const { operating_company_id, unit_id } = parsed.data;

    return withCompany(user.uuid, operating_company_id, async (client) => {
      const services = await client.query<{
        id: string; service_code: string; service_name: string;
        interval_miles: number | null; interval_months: number | null;
        applies_to_type: string; is_safety_critical: boolean;
      }>(
        "SELECT id, service_code, service_name, interval_miles, interval_months, interval_hours, applies_to_type, is_safety_critical FROM mdata.maintenance_services WHERE operating_company_id = $1 AND is_active = true",
        [operating_company_id]
      );

      // FIX (verified vs prod-copy schema): the original `hub_meter_current FROM mdata.units` 500'd —
      // mdata.units has NO hub_meter_current AND NO operating_company_id (both phantom → 42703). It also has
      // NO odometer column at all. The unit's current odometer lives in telematics.vehicle_latest_position
      // (odometer_mi, keyed by unit_id + operating_company_id — the live Samsara odometer). Alias keeps the
      // downstream .hub_meter_current shape; returns null when the unit has no GPS odometer yet (calc handles null).
      const unitRow = await client.query<{ hub_meter_current: number | null }>(
        "SELECT odometer_mi AS hub_meter_current FROM telematics.vehicle_latest_position WHERE unit_id = $1 AND operating_company_id = $2 LIMIT 1",
        [unit_id, operating_company_id]
      );
      const currentOdo = (unitRow.rows[0] as { hub_meter_current?: number | null } | undefined)?.hub_meter_current ?? null;

      // FIX (verified vs prod-copy): maintenance.work_orders has NEITHER completed_at NOR
      // hub_meter_at_completion (both phantom → 42703 — this endpoint never worked on prod). The real PM
      // tracking is maintenance.pm_schedules (unit_id + last_service_odometer). Use the unit's furthest
      // last-service odometer; there is no last-service DATE column on pm_schedules → date-based eta degrades
      // to null (mile-based eta still computes). Stops the 500 with correct mileage data.
      const lastSvcRow = await client.query<{ last_odo: number | null }>(
        `SELECT MAX(last_service_odometer) AS last_odo FROM maintenance.pm_schedules WHERE unit_id = $1 AND operating_company_id = $2 AND is_active = true`,
        [unit_id, operating_company_id]
      );
      const lastCompletedDate: string | null = null;
      const lastCompletedOdo = (lastSvcRow.rows[0] as { last_odo?: number | null } | undefined)?.last_odo ?? null;

      return services.rows.map((svc) => ({
        ...svc,
        eta: calculateServiceEta({
          intervalMiles: svc.interval_miles,
          intervalMonths: svc.interval_months,
          lastCompletedOdometer: lastCompletedOdo,
          lastCompletedDate,
          currentOdometer: currentOdo,
        }),
      }));
    });
  });

  app.post("/api/v1/catalogs/maintenance/services-catalog", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    if (!["Owner", "Administrator", "Manager", "Mechanic"].includes(user.role)) return reply.code(403).send({ error: "forbidden" });
    const body = createSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });
    const d = body.data;
    const created = await withCompany(user.uuid, d.operating_company_id, async (client) => {
      const res = await client.query(
        `INSERT INTO mdata.maintenance_services (operating_company_id, service_code, service_name, service_category, applies_to_type, interval_miles, interval_months, interval_hours, is_safety_critical, typical_duration_hours, typical_cost_cents, compliance_ref, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
        [d.operating_company_id, d.service_code, d.service_name, d.service_category, d.applies_to_type, d.interval_miles ?? null, d.interval_months ?? null, d.interval_hours ?? null, d.is_safety_critical, d.typical_duration_hours ?? null, d.typical_cost_cents, d.compliance_ref ?? null, d.is_active]
      );
      return res.rows[0];
    });
    return reply.code(201).send(created);
  });
}
