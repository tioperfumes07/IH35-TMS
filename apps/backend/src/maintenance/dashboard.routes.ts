import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { shouldUseDevFixturesForMaintenance, triageDevFixtures } from "./dev-fixtures.js";
import { listWorkOrdersByBucket } from "./work-orders.service.js";
import { avgAgeYears } from "./fleet-age.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

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
  await assertCompanyMembership(userId, companyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
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
      // Reproduces views.maintenance_intransit_triage_queue (0041) EXACTLY — same SELECT/joins/filters/order
      // — and additionally exposes Load # + ETA for design-parity (in-transit-issues.html) without a gated
      // view migration. load_id/stop_id are real FKs on dispatch.intransit_issues; ETA = the issue stop's
      // scheduled_arrival_at (real scheduled data, not a fabricated column). RLS-scoped via withCompany.
      const res = await client.query(`
        SELECT
          i.id,
          i.reported_at,
          i.unit_id,
          i.driver_id,
          i.gps_lat::numeric AS gps_lat,
          i.gps_lng::numeric AS gps_lng,
          i.gps_label,
          i.issue_category,
          i.issue_description,
          i.severity,
          i.promoted_to_wo_id,
          i.promoted_to_damage_report_id,
          COALESCE(u.unit_number, '') AS unit_display_id,
          CONCAT_WS(' ', d.first_name, d.last_name) AS driver_full_name,
          EXTRACT(epoch FROM (now() - i.reported_at)) / 3600 AS hours_since_report,
          i.load_id,
          CASE WHEN l.id IS NOT NULL THEN COALESCE(l.load_number, l.id::text) END AS load_display_id,
          s.scheduled_arrival_at::text AS eta_at
        FROM dispatch.intransit_issues i
        JOIN mdata.units u ON u.id = i.unit_id
        JOIN mdata.drivers d ON d.id = i.driver_id
        -- Entity-scoped on PURPOSE: mdata.loads RLS allows any of a multi-entity user's companies, so we
        -- additionally pin the Load # join to the viewed operating company ($1) — a load from another entity
        -- (TRANSP/TRK/USMCA) can never surface here even for a cross-entity user. ETA stop inherits the load.
        LEFT JOIN mdata.loads l ON l.id = i.load_id AND l.operating_company_id = $1
        LEFT JOIN mdata.load_stops s ON s.id = i.stop_id AND s.load_id = l.id
        WHERE i.promoted_to_wo_id IS NULL
          AND i.promoted_to_damage_report_id IS NULL
        ORDER BY i.reported_at DESC
        LIMIT 50
      `, [companyId]);
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
      // FLEET-1: avg age MUST be derived from the model `year`, not acquired_date/created_at
      // (which collapsed the KPI to ~0). Aggregate only the year-bearing units' model years and
      // compute the average in JS via the avgAgeYears helper so null/0-year units (the 72
      // trailers) are excluded from BOTH numerator and denominator.
      const units = await client.query(
        `
          SELECT
            COUNT(*)::int AS total_units,
            COUNT(*) FILTER (WHERE status = 'InService')::int AS active_units,
            COUNT(*) FILTER (WHERE status = 'InMaintenance')::int AS in_shop_units,
            COUNT(*) FILTER (WHERE COALESCE(is_oos, false))::int AS out_of_service_units,
            COALESCE(
              array_agg(year) FILTER (WHERE year IS NOT NULL AND year > 0),
              ARRAY[]::int[]
            )::int[] AS model_years
          FROM mdata.units
          WHERE owner_company_id = $1::uuid
            AND deactivated_at IS NULL
        `,
        [companyId]
      );
      const row = units.rows[0] ?? {
        total_units: 0,
        active_units: 0,
        in_shop_units: 0,
        out_of_service_units: 0,
        model_years: [],
      };
      const { model_years, ...counts } = row;
      return {
        ...counts,
        // null when no unit has a usable model year — the UI renders "-" (never "0.0 y").
        avg_age_years: avgAgeYears((model_years ?? []) as Array<number | null>),
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
