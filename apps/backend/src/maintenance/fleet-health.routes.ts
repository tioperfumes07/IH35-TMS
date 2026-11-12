/**
 * 443.245 CC-1 — Fleet Health endpoint
 * GET /api/v1/maintenance/fleet-health?operating_company_id=…
 *
 * Per unit: PM state, body_style, live odo, driver, current load, open WO, fault count.
 * 443.218 rule: every number from SQL aggregates — no client-side arithmetic.
 * PM status and projected days come from the canonical PM due engine.
 * body_style: /389/ → classic, /VOLVO|CASCADIA/ → sloped, else aero.
 * state priority: shop > overdue > soon (≤14 d) > ok > none.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { excludeDemoPhantomSql, excludeSampleDataSql } from "../mdata/fleet-visibility.js";

// LEAD 11-02 (live /maintenance 5:20 PM CT): the Fleet health line listed SAM-b7317a51 / SAM-c4530bd3 / SAM-fa16e203 —
// Samsara dual-write phantoms (vehicle_type NULL, VIN 'SAMVIN-…', 0 loads/fuel/WOs/bills; last ping 06/2019). Same
// fleet-visibility rule the Fleet roster, Home and Insurance already apply — one rule, not a local copy.
const FLEET_HEALTH_VISIBLE_UNIT_SQL = `${excludeDemoPhantomSql("u.unit_number")} AND ${excludeSampleDataSql("u.is_sample_data")}`;
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { openWorkOrderPredicateSql } from "./in-shop-condition.js";
import { canonicalDispatchWorkStatusClause } from "../dispatch/canonical-active-load-set.js";
import { computePmDueEngineForCompany } from "./pm-due-engine.service.js";
import { fleetHealthPmRows, FLEET_PM_CTE } from "./fleet-health-pm.js";
import { loadPmOdometers } from "./pm-current-odometer.js";
import { companyBusinessDate } from "../lib/company-business-date.js";
import {
  unitOpenVdaDriverLateralSql,
  unitLastDeliveredDriverLateralSql,
  unitCurrentDriverJoinSql,
} from "../dispatch/unit-current-driver.js";

const querySchema = z.object({
  operating_company_id: z.string().uuid(),
  state: z.enum(["all", "ok", "soon", "overdue", "shop", "none", "unknown"]).optional().default("all"),
  limit: z.coerce.number().int().min(1).max(500).default(200),
  offset: z.coerce.number().int().min(0).default(0),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

export async function registerFleetHealthRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/maintenance/fleet-health",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = authed(req, reply);
      if (!user) return;
      const parsed = querySchema.safeParse(req.query ?? {});
      if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
      const q = parsed.data;

      await assertCompanyMembership(user.uuid, q.operating_company_id);

      const rows = await withCurrentUser(user.uuid, async (client) => {
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [q.operating_company_id]);
        const fleet = await client.query<{ id: string }>(`
          SELECT u.id::text FROM mdata.units u
          WHERE COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = $1::uuid
            AND u.disposed_date IS NULL
            AND ${FLEET_HEALTH_VISIBLE_UNIT_SQL}
        `, [q.operating_company_id]);
        const odometers = await loadPmOdometers(client, q.operating_company_id, fleet.rows.map(row => row.id));
        const pmRows = fleetHealthPmRows(await computePmDueEngineForCompany(client, q.operating_company_id, odometers), companyBusinessDate(), odometers.byUnit);
        const values = [q.operating_company_id, q.limit, q.offset, JSON.stringify(pmRows)];

        // KPI aggregate (separate query, single round-trip for the summary chips)
        const kpiRes = await client.query(
          `
          WITH co AS (SELECT $1::uuid AS oc_id, $2::int AS page_limit, $3::int AS page_offset),
          units AS (
            SELECT u.id
            FROM mdata.units u, co
            WHERE COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = co.oc_id
              AND u.disposed_date IS NULL
              AND ${FLEET_HEALTH_VISIBLE_UNIT_SQL}
          ),
          ${FLEET_PM_CTE},
          shop_units AS (
            SELECT DISTINCT wo.unit_id
            FROM maintenance.work_orders wo, co
            WHERE wo.operating_company_id = co.oc_id
              -- LEAD 443.267-A: maintenance.work_orders has no reported_in_shop (42703 → 500). In shop = an OPEN work order —
              -- the canonical predicate (same as /maintenance/in-shop-units and the dispatch UNIT_IN_SERVICE_SQL gate).
              AND ${openWorkOrderPredicateSql("wo")}
          ),
          state_map AS (
            SELECT
              u.id,
              CASE
                WHEN su.unit_id IS NOT NULL THEN 'shop'
                ELSE COALESCE(pm.state, 'none')
              END AS state
            FROM units u
            LEFT JOIN pm_best pm ON pm.unit_id = u.id
            LEFT JOIN shop_units su ON su.unit_id = u.id
          )
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE state = 'ok')::int AS ok,
            COUNT(*) FILTER (WHERE state = 'soon')::int AS soon,
            COUNT(*) FILTER (WHERE state = 'overdue')::int AS overdue,
            COUNT(*) FILTER (WHERE state = 'shop')::int AS shop,
            COUNT(*) FILTER (WHERE state = 'none')::int AS no_clock,
            COUNT(*) FILTER (WHERE state = 'unknown')::int AS unknown
          FROM state_map
          `,
          values
        );
        const kpi = kpiRes.rows[0];

        // Per-unit rows
        const stateFilter = q.state === "all" ? "" : `AND _state.state = '${q.state}'`;

        const unitRes = await client.query(
          `
          WITH co AS (SELECT $1::uuid AS oc_id),
          ${FLEET_PM_CTE},
          open_wo AS (
            SELECT
              wo.unit_id,
              COUNT(*)::int AS open_count,
              true AS in_shop, -- every row here is an open work order = in shop (canonical predicate, see shop_units)
              (array_agg(wo.id::text ORDER BY wo.created_at DESC))[1] AS latest_wo_id,
              (array_agg(wo.display_id ORDER BY wo.created_at DESC))[1] AS latest_wo_display_id,
              (array_agg(wo.status::text ORDER BY wo.created_at DESC))[1] AS latest_wo_status
            FROM maintenance.work_orders wo, co
            WHERE wo.operating_company_id = co.oc_id
              AND ${openWorkOrderPredicateSql("wo")}
            GROUP BY wo.unit_id
          ),
          fault_counts AS (
            SELECT h.unit_id, COUNT(*)::int AS fault_count
            FROM maintenance.samsara_fault_code_history h, co
            WHERE h.operating_company_id = co.oc_id
              AND h.resolved_at IS NULL
            GROUP BY h.unit_id
          ),
          unit_state AS (
            SELECT
              u.id AS unit_id,
              CASE
                WHEN ow.in_shop = true THEN 'shop'
                ELSE COALESCE(pm.state, 'none')
              END AS state
            -- 443.267-A: CROSS JOIN, not a comma — an explicit JOIN binds tighter than ",", so "u, co LEFT JOIN … u.id"
            -- could not see u (42P01 → 500).
            FROM mdata.units u CROSS JOIN co
            LEFT JOIN pm_best pm ON pm.unit_id = u.id
            LEFT JOIN open_wo ow ON ow.unit_id = u.id
            WHERE COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = co.oc_id
              AND u.disposed_date IS NULL
              AND ${FLEET_HEALTH_VISIBLE_UNIT_SQL}
          )
          SELECT
            u.id::text AS unit_id,
            u.unit_number,
            u.make,
            u.model,
            u.year,
            CASE
              WHEN (COALESCE(u.make,'') || ' ' || COALESCE(u.model,'')) ~ '389' THEN 'classic'
              WHEN (COALESCE(u.make,'') || ' ' || COALESCE(u.model,'')) ~* 'VOLVO|CASCADIA' THEN 'sloped'
              ELSE 'aero'
            END AS body_style,

            /* live telemetry */
            pm.odometer_mi,
            pm.odometer_source,
            pm.odometer_read_at,
            pm.pm_status_reason,
            vlp.captured_at::text AS telemetry_at,
            vlp.city AS telemetry_city,
            vlp.state AS telemetry_state,
            vlp.formatted_location,
            vlp.speed_mph,
            vlp.engine_state,

            /* PM */
            pm.pm_schedule_id::text,
            pm.pm_label,
            pm.pm_interval,
            pm.last_service_odometer,
            COALESCE(pm.pm_baseline_absent, false) AS pm_baseline_absent,
            pm.next_due_odometer,
            pm.miles_left,
            pm.days_left,

            /* state */
            _state.state,

            /* open WO */
            COALESCE(ow.open_count, 0) AS open_wo_count,
            ow.in_shop,
            ow.latest_wo_id,
            ow.latest_wo_display_id,
            ow.latest_wo_status,

            /* fault codes */
            COALESCE(fc.fault_count, 0) AS fault_count,

            /* current driver */
            ud.id::text AS driver_id,
            ud.first_name || ' ' || ud.last_name AS driver_name,

            /* current load */
            cl.id::text AS load_id,
            cl.load_number,
            cl.status AS load_status

          FROM mdata.units u CROSS JOIN co -- 443.267-A: comma + JOIN = 42P01 (see unit_state)
          JOIN unit_state _state ON _state.unit_id = u.id
          LEFT JOIN pm_best pm ON pm.unit_id = u.id
          LEFT JOIN telematics.vehicle_latest_position vlp
            ON vlp.unit_id = u.id AND vlp.operating_company_id = co.oc_id
          LEFT JOIN open_wo ow ON ow.unit_id = u.id
          LEFT JOIN fault_counts fc ON fc.unit_id = u.id

          /* current driver — ONE read per the unit-current-driver contract */
          ${unitOpenVdaDriverLateralSql("u", "$1::uuid")}
          ${unitLastDeliveredDriverLateralSql("u", "$1::uuid")}
          ${unitCurrentDriverJoinSql("$1::uuid")}

          /* current active load for unit */
          LEFT JOIN LATERAL (
            SELECT l.id, l.load_number, l.status
            FROM mdata.loads l
            WHERE l.assigned_unit_id = u.id
              AND l.operating_company_id = $1::uuid
              AND l.soft_deleted_at IS NULL
              AND ${canonicalDispatchWorkStatusClause("l")}
            ORDER BY l.updated_at DESC NULLS LAST
            LIMIT 1
          ) cl ON true

          WHERE COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = $1::uuid
            AND u.disposed_date IS NULL
              AND ${FLEET_HEALTH_VISIBLE_UNIT_SQL}
            ${stateFilter}

          ORDER BY
            CASE _state.state
              WHEN 'overdue' THEN 1
              WHEN 'shop'    THEN 2
              WHEN 'soon'    THEN 3
              WHEN 'ok'      THEN 4
              ELSE 5
            END,
            pm.miles_left ASC NULLS LAST,
            u.unit_number

          LIMIT $2 OFFSET $3
          `,
          values
        );

        return { kpi, units: unitRes.rows };
      });

      return rows;
    }
  );
}
