import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { shouldUseDevFixturesForMaintenance, triageDevFixtures } from "./dev-fixtures.js";
import { listWorkOrdersByBucket } from "./work-orders.service.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function validationError(reply: FastifyReply, err: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: err.flatten() });
}

async function withCompany<T>(userId: string, companyId: string, fn: (client: any) => Promise<T>) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${companyId}'`);
    return fn(client);
  });
}

async function relationExists(client: any, rel: string) {
  const res = await client.query(`SELECT to_regclass($1) IS NOT NULL AS ok`, [rel]);
  return Boolean((res.rows[0] as { ok?: boolean } | undefined)?.ok);
}

/** Dashboard KPIs live in dashboard-kpis.routes.ts: /api/v1/maintenance/dashboard/kpis */
export async function registerMaintenanceDashboardRoutes(app: FastifyInstance) {
  app.get("/api/v1/maintenance/dashboard/rm-status", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const companyId = parsed.data.operating_company_id;

    const buckets = await withCompany(user.uuid, companyId, async (client) => {
      if (!(await relationExists(client, "maintenance.work_orders"))) return { in_house: [], external: [], roadside: [] };
      return listWorkOrdersByBucket(client, companyId);
    });
    return buckets;
  });

  app.get("/api/v1/maintenance/dashboard/severe-alerts", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const companyId = parsed.data.operating_company_id;

    const rows = await withCompany(user.uuid, companyId, async (client) => {
      if (!(await relationExists(client, "views.maintenance_severe_repair_alerts"))) return [];
      const res = await client.query(`SELECT * FROM views.maintenance_severe_repair_alerts LIMIT 50`);
      return res.rows;
    });
    return { alerts: rows };
  });

  app.get("/api/v1/maintenance/dashboard/intransit-triage-queue", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const companyId = parsed.data.operating_company_id;

    const rows = await withCompany(user.uuid, companyId, async (client) => {
      if (!(await relationExists(client, "views.maintenance_intransit_triage_queue"))) {
        if (shouldUseDevFixturesForMaintenance()) {
          console.warn("Maintenance triage queue using DEV fixtures because view is unavailable.");
          return triageDevFixtures();
        }
        return [];
      }
      const res = await client.query(`SELECT * FROM views.maintenance_intransit_triage_queue LIMIT 50`);
      if (res.rows.length > 0) return res.rows;
      if (shouldUseDevFixturesForMaintenance()) {
        console.warn("Maintenance triage queue using DEV fixtures because queue is empty.");
        return triageDevFixtures();
      }
      return [];
    });
    return { issues: rows };
  });

  app.get("/api/v1/maintenance/dashboard/recent-activity", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const companyId = parsed.data.operating_company_id;

    const payload = await withCompany(user.uuid, companyId, async (client) => {
      if (!(await relationExists(client, "maintenance.work_orders"))) return { recent: [], completed: [] };
      const recent = await client.query(
        `
          SELECT * FROM maintenance.work_orders
          WHERE operating_company_id = $1
          ORDER BY opened_at DESC NULLS LAST, created_at DESC
          LIMIT 5
        `,
        [companyId]
      );
      const completed = await client.query(
        `
          SELECT * FROM maintenance.work_orders
          WHERE operating_company_id = $1
            AND status = 'complete'
          ORDER BY updated_at DESC NULLS LAST
          LIMIT 5
        `,
        [companyId]
      );
      return { recent: recent.rows, completed: completed.rows };
    });
    return payload;
  });

  app.get("/api/v1/maintenance/dashboard/dtc-auto-work-orders", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const companyId = parsed.data.operating_company_id;

    const rows = await withCompany(user.uuid, companyId, async (client) => {
      if (!(await relationExists(client, "maintenance.work_orders"))) return [];
      const res = await client.query(
        `
          SELECT
            w.id::text,
            w.display_id,
            w.unit_id::text,
            u.unit_number,
            w.status::text,
            w.description,
            w.opened_at::text,
            w.updated_at::text
          FROM maintenance.work_orders w
          JOIN mdata.units u ON u.id = w.unit_id
          WHERE w.operating_company_id = $1::uuid
            AND w.status::text IN ('open', 'in_progress', 'waiting_parts')
            AND w.description ILIKE '[samsara_dtc_auto]%'
          ORDER BY w.opened_at DESC NULLS LAST, w.created_at DESC
          LIMIT 50
        `,
        [companyId]
      );
      return res.rows;
    });
    return { rows };
  });

  app.get("/api/v1/maintenance/fleet-table/kpis", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const companyId = parsed.data.operating_company_id;

    const payload = await withCompany(user.uuid, companyId, async (client) => {
      const units = await client.query(
        `
          SELECT
            COUNT(*)::int AS total_units,
            COUNT(*) FILTER (WHERE status = 'InService')::int AS active_units,
            COUNT(*) FILTER (WHERE status = 'InMaintenance')::int AS in_shop_units,
            COUNT(*) FILTER (WHERE COALESCE(is_oos, false))::int AS out_of_service_units,
            COALESCE(AVG(EXTRACT(YEAR FROM age(now(), COALESCE(acquired_date::timestamp, created_at)))), 0)::numeric AS avg_age_years
          FROM mdata.units
          WHERE owner_company_id = $1::uuid
            AND deactivated_at IS NULL
        `,
        [companyId]
      );
      return units.rows[0] ?? {
        total_units: 0,
        active_units: 0,
        in_shop_units: 0,
        out_of_service_units: 0,
        avg_age_years: 0,
      };
    });

    return payload;
  });

  app.get("/api/v1/maintenance/fleet-table/rows", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const companyId = parsed.data.operating_company_id;

    const rows = await withCompany(user.uuid, companyId, async (client) => {
      // Fleet-table keystone: enrich each unit with LIVE maintenance status (additive columns).
      // - odometer_mi  : latest Samsara odometer (telematics.vehicle_latest_position, #1289)
      // - next_due_odometer : nearest active PM due-mileage (maintenance.pm_schedules)
      // - open_wo_count : open work orders (maintenance.work_orders, not complete/cancelled)
      // Each source is guarded by relationExists so envs without the table still return the base row.
      const [hasVlp, hasPm, hasWo] = await Promise.all([
        relationExists(client, "telematics.vehicle_latest_position"),
        relationExists(client, "maintenance.pm_schedules"),
        relationExists(client, "maintenance.work_orders"),
      ]);
      const odoExpr = hasVlp
        ? `(SELECT vlp.odometer_mi FROM telematics.vehicle_latest_position vlp
             WHERE vlp.unit_id = u.id AND vlp.operating_company_id = $1::uuid)`
        : `NULL::double precision`;
      const pmExpr = hasPm
        ? `(SELECT MIN(ps.next_due_odometer) FROM maintenance.pm_schedules ps
             WHERE ps.unit_id = u.id AND ps.is_active AND ps.next_due_odometer IS NOT NULL)`
        : `NULL::int`;
      const woExpr = hasWo
        ? `(SELECT COUNT(*) FROM maintenance.work_orders wo
             WHERE wo.unit_id = u.id AND wo.status NOT IN ('complete', 'cancelled'))`
        : `0`;
      const res = await client.query(
        `
          SELECT
            u.id,
            u.unit_number,
            u.vin,
            u.make,
            u.model,
            u.year,
            u.status,
            u.is_oos,
            u.oos_since,
            u.oos_reason,
            u.qbo_vendor_id,
            u.samsara_vehicle_id,
            ${odoExpr} AS odometer_mi,
            ${pmExpr} AS next_due_odometer,
            ${woExpr}::int AS open_wo_count
          FROM mdata.units u
          WHERE u.owner_company_id = $1::uuid
            AND u.deactivated_at IS NULL
          ORDER BY u.unit_number ASC
          LIMIT 500
        `,
        [companyId]
      );
      return res.rows;
    });

    return { rows };
  });

  app.get("/api/v1/maintenance/service-location/kpis", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const companyId = parsed.data.operating_company_id;

    const payload = await withCompany(user.uuid, companyId, async (client) => {
      const res = await client.query(
        `
          SELECT
            COUNT(*) FILTER (WHERE COALESCE(bucket::text,
              CASE
                WHEN repair_location = 'mobile_roadside' THEN 'roadside'
                WHEN repair_location = 'in_house' THEN 'in_house'
                ELSE 'external'
              END
            ) = 'in_house')::int AS in_house_count,
            COUNT(*) FILTER (WHERE COALESCE(bucket::text,
              CASE
                WHEN repair_location = 'mobile_roadside' THEN 'roadside'
                WHEN repair_location = 'in_house' THEN 'in_house'
                ELSE 'external'
              END
            ) = 'external')::int AS external_count,
            COUNT(*) FILTER (WHERE COALESCE(bucket::text,
              CASE
                WHEN repair_location = 'mobile_roadside' THEN 'roadside'
                WHEN repair_location = 'in_house' THEN 'in_house'
                ELSE 'external'
              END
            ) = 'roadside')::int AS roadside_count,
            COUNT(DISTINCT NULLIF(trim(COALESCE(repair_location, '')), ''))::int AS unique_locations
          FROM maintenance.work_orders
          WHERE operating_company_id = $1::uuid
            AND status NOT IN ('complete', 'cancelled')
        `,
        [companyId]
      );
      return res.rows[0] ?? { in_house_count: 0, external_count: 0, roadside_count: 0, unique_locations: 0 };
    });

    return payload;
  });

  app.get("/api/v1/maintenance/service-location/rows", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const companyId = parsed.data.operating_company_id;

    const rows = await withCompany(user.uuid, companyId, async (client) => {
      const res = await client.query(
        `
          SELECT
            COALESCE(NULLIF(trim(repair_location), ''), 'unspecified') AS service_location,
            COALESCE(bucket::text,
              CASE
                WHEN repair_location = 'mobile_roadside' THEN 'roadside'
                WHEN repair_location = 'in_house' THEN 'in_house'
                ELSE 'external'
              END
            ) AS bucket,
            COUNT(*)::int AS open_work_orders
          FROM maintenance.work_orders
          WHERE operating_company_id = $1::uuid
            AND status NOT IN ('complete', 'cancelled')
          GROUP BY 1, 2
          ORDER BY open_work_orders DESC, service_location ASC
          LIMIT 250
        `,
        [companyId]
      );
      return res.rows;
    });

    return { rows };
  });

  app.get("/api/v1/maintenance/settings", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const companyId = parsed.data.operating_company_id;

    const payload = await withCompany(user.uuid, companyId, async (client) => {
      const pmRes = await client.query(
        `
          SELECT COUNT(*)::int AS pm_schedules
          FROM maintenance.pm_schedules
          WHERE operating_company_id = $1::uuid
        `,
        [companyId]
      );
      const vendorRes = await client.query(
        `
          SELECT COUNT(*)::int AS maintenance_vendors
          FROM mdata.vendors
          WHERE operating_company_id = $1::uuid
            AND vendor_type = 'Repair'
        `,
        [companyId]
      );
      return {
        pm_interval_days_default: 30,
        notification_email_enabled: true,
        default_shop_location: "Main yard",
        pm_schedules: Number(pmRes.rows[0]?.pm_schedules ?? 0),
        maintenance_vendors: Number(vendorRes.rows[0]?.maintenance_vendors ?? 0),
      };
    });

    return payload;
  });

  app.get("/api/v1/maintenance/parts-inventory/kpis", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const companyId = parsed.data.operating_company_id;

    const payload = await withCompany(user.uuid, companyId, async (client) => {
      const res = await client.query(
        `
          SELECT
            COUNT(*)::int AS total_parts,
            COUNT(*) FILTER (WHERE COALESCE(on_hand_qty, 0) <= 2)::int AS low_stock_count,
            COALESCE(SUM(COALESCE(on_hand_qty, 0) * COALESCE(last_purchase_amount, 0)), 0)::numeric AS total_inventory_value
          FROM maintenance.parts_inventory
          WHERE operating_company_id = $1::uuid
        `,
        [companyId]
      );
      return res.rows[0] ?? { total_parts: 0, low_stock_count: 0, total_inventory_value: 0 };
    });

    return payload;
  });
}
