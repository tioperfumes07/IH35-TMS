/**
 * 443.245 CC-1 — Unit Service Map endpoint
 * GET /api/v1/maintenance/units/:id/service-map?operating_company_id=…
 *
 * Returns the 8 standard service systems per unit with state + last service + source.
 * A system with no record returns state='no_record' — never invented.
 *
 * Systems (indices match UI pin order):
 *  0  engine_pm    — PM-A oil/engine  (WO / pm_schedule)
 *  1  cab_dvir     — Cab DVIR         (safety.dvir_submissions)
 *  2  steer_tires  — Steer tires      (WO / work_order_parts position_code)
 *  3  drive_axles  — Drive axles      (WO / work_order_parts)
 *  4  trailer_brakes — Trailer brakes (WO)
 *  5  trailer_tires  — Trailer tires  (WO / work_order_parts)
 *  6  reefer         — Reefer unit    (pm_schedule label / WO)
 *  7  annual_dot     — Annual DOT     (maintenance.inspections type=annual_dot)
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { openWorkOrderPredicateSql } from "./in-shop-condition.js";

const querySchema = z.object({
  operating_company_id: z.string().uuid(),
});
const paramSchema = z.object({ id: z.string().uuid() });

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

export async function registerServiceMapRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/maintenance/units/:id/service-map",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = authed(req, reply);
      if (!user) return;
      const params = paramSchema.safeParse(req.params);
      if (!params.success) return reply.code(400).send({ error: "invalid_unit_id" });
      const query = querySchema.safeParse(req.query ?? {});
      if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });

      await assertCompanyMembership(user.uuid, query.data.operating_company_id);

      const data = await withCurrentUser(user.uuid, async (client) => {
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [query.data.operating_company_id]);

        // Verify unit belongs to company
        const unitCheck = await client.query(
          `SELECT u.id, u.unit_number, u.make, u.model, u.year
             FROM mdata.units u
            WHERE u.id = $1::uuid
              AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = $2::uuid
              AND u.disposed_date IS NULL`,
          [params.data.id, query.data.operating_company_id]
        );
        if (!unitCheck.rows.length) return null;
        const unit = unitCheck.rows[0];

        const r = await client.query(
          `
          WITH co  AS (SELECT $1::uuid AS oc_id),
               uid AS (SELECT $2::uuid AS unit_id),

          /* 0 · engine_pm — latest miles-based pm_schedule */
          engine_pm AS (
            SELECT ps.id::text AS source_id,
                   'pm_schedule'  AS source,
                   ps.label       AS service_label,
                   ps.last_performed_at::text AS last_service_at,
                   ps.last_service_odometer AS last_service_odo,
                   ps.next_due_odometer AS next_due_odo,
                   CASE
                     WHEN (SELECT vlp.odometer_mi FROM telematics.vehicle_latest_position vlp, co
                            WHERE vlp.unit_id = uid.unit_id AND vlp.operating_company_id = co.oc_id LIMIT 1)
                          >= ps.next_due_odometer THEN 'overdue'
                     ELSE 'ok'
                   END AS state
            FROM maintenance.pm_schedules ps, co, uid
            WHERE ps.unit_id = uid.unit_id
              AND ps.operating_company_id = co.oc_id
              AND ps.interval_kind = 'miles'
            ORDER BY ps.updated_at DESC NULLS LAST
            LIMIT 1
          ),

          /* 1 · cab_dvir — last DVIR submission for this unit */
          cab_dvir AS (
            SELECT ds.id::text AS source_id,
                   'dvir'        AS source,
                   ds.type       AS service_label,
                   ds.submitted_at::text AS last_service_at,
                   NULL::int     AS last_service_odo,
                   NULL::int     AS next_due_odo,
                   CASE WHEN ds.defects_found = 0 THEN 'ok' ELSE 'attention' END AS state
            FROM safety.dvir_submissions ds, uid
            WHERE ds.unit_id = uid.unit_id
            ORDER BY ds.submitted_at DESC NULLS LAST
            LIMIT 1
          ),

          /* 2–5 · tires + brakes — latest WO containing a part at those positions */
          steer_tires AS (
            SELECT wop.work_order_id::text AS source_id,
                   'work_order' AS source,
                   wop.part_label AS service_label,
                   wo.completed_at::text AS last_service_at,
                   NULL::int AS last_service_odo,
                   NULL::int AS next_due_odo,
                   'ok' AS state
            FROM maintenance.work_order_parts wop
            JOIN maintenance.work_orders wo ON wo.id = wop.work_order_id, co, uid
            WHERE wop.unit_id = uid.unit_id
              AND wo.operating_company_id = co.oc_id
              AND (wop.position_code ILIKE '%steer%' OR wop.part_label ILIKE '%steer%tire%' OR wop.part_label ILIKE '%front%tire%')
              AND wo.completed_at IS NOT NULL
            ORDER BY wo.completed_at DESC NULLS LAST
            LIMIT 1
          ),

          drive_axles AS (
            SELECT wop.work_order_id::text AS source_id,
                   'work_order' AS source,
                   wop.part_label AS service_label,
                   wo.completed_at::text AS last_service_at,
                   NULL::int AS last_service_odo,
                   NULL::int AS next_due_odo,
                   'ok' AS state
            FROM maintenance.work_order_parts wop
            JOIN maintenance.work_orders wo ON wo.id = wop.work_order_id, co, uid
            WHERE wop.unit_id = uid.unit_id
              AND wo.operating_company_id = co.oc_id
              AND (wop.position_code ILIKE '%drive%' OR wop.part_label ILIKE '%drive%tire%' OR wop.part_label ILIKE '%axle%')
              AND wo.completed_at IS NOT NULL
            ORDER BY wo.completed_at DESC NULLS LAST
            LIMIT 1
          ),

          trailer_brakes AS (
            SELECT wo.id::text AS source_id,
                   'work_order' AS source,
                   'Trailer brakes' AS service_label,
                   wo.completed_at::text AS last_service_at,
                   NULL::int AS last_service_odo,
                   NULL::int AS next_due_odo,
                   'ok' AS state
            FROM maintenance.work_orders wo
            JOIN maintenance.work_order_lines wol ON wol.work_order_uuid = wo.id, co, uid
            WHERE wo.unit_id = uid.unit_id
              AND wo.operating_company_id = co.oc_id
              AND wol.description ILIKE '%brake%'
              AND wo.completed_at IS NOT NULL
            ORDER BY wo.completed_at DESC NULLS LAST
            LIMIT 1
          ),

          trailer_tires AS (
            SELECT wop.work_order_id::text AS source_id,
                   'work_order' AS source,
                   wop.part_label AS service_label,
                   wo.completed_at::text AS last_service_at,
                   NULL::int AS last_service_odo,
                   NULL::int AS next_due_odo,
                   'ok' AS state
            FROM maintenance.work_order_parts wop
            JOIN maintenance.work_orders wo ON wo.id = wop.work_order_id, co, uid
            WHERE wop.unit_id = uid.unit_id
              AND wo.operating_company_id = co.oc_id
              AND (wop.position_code ILIKE '%trailer%' OR wop.part_label ILIKE '%trailer%tire%')
              AND wo.completed_at IS NOT NULL
            ORDER BY wo.completed_at DESC NULLS LAST
            LIMIT 1
          ),

          /* 6 · reefer — pm_schedule label or WO */
          reefer AS (
            SELECT ps.id::text AS source_id,
                   'pm_schedule' AS source,
                   ps.label AS service_label,
                   ps.last_performed_at::text AS last_service_at,
                   NULL::int AS last_service_odo,
                   NULL::int AS next_due_odo,
                   'ok' AS state
            FROM maintenance.pm_schedules ps, co, uid
            WHERE ps.unit_id = uid.unit_id
              AND ps.operating_company_id = co.oc_id
              AND ps.label ILIKE '%reefer%'
            ORDER BY ps.updated_at DESC NULLS LAST
            LIMIT 1
          ),

          /* 7 · annual_dot — maintenance.inspections */
          annual_dot AS (
            SELECT mi.id::text AS source_id,
                   'inspection' AS source,
                   mi.inspection_type AS service_label,
                   mi.inspection_date::text AS last_service_at,
                   NULL::int AS last_service_odo,
                   NULL::int AS next_due_odo,
                   'ok' AS state
            FROM maintenance.inspections mi, co, uid
            WHERE mi.unit_id = uid.unit_id
              AND mi.operating_company_id = co.oc_id
              AND mi.inspection_type = 'annual_dot'
              AND mi.archived_at IS NULL
            ORDER BY mi.inspection_date DESC NULLS LAST
            LIMIT 1
          )

          SELECT
            json_build_object(
              'system_id', 'engine_pm',
              'label', 'Engine / PM-A',
              'source_id', e.source_id,
              'source', e.source,
              'service_label', e.service_label,
              'last_service_at', e.last_service_at,
              'last_service_odo', e.last_service_odo,
              'next_due_odo', e.next_due_odo,
              'state', COALESCE(e.state, 'no_record')
            ) AS engine_pm,
            json_build_object(
              'system_id', 'cab_dvir',
              'label', 'Cab DVIR',
              'source_id', d.source_id,
              'source', d.source,
              'service_label', d.service_label,
              'last_service_at', d.last_service_at,
              'state', COALESCE(d.state, 'no_record')
            ) AS cab_dvir,
            json_build_object(
              'system_id', 'steer_tires',
              'label', 'Steer Tires',
              'source_id', st.source_id,
              'source', st.source,
              'service_label', st.service_label,
              'last_service_at', st.last_service_at,
              'state', COALESCE(st.state, 'no_record')
            ) AS steer_tires,
            json_build_object(
              'system_id', 'drive_axles',
              'label', 'Drive Axles',
              'source_id', da.source_id,
              'source', da.source,
              'service_label', da.service_label,
              'last_service_at', da.last_service_at,
              'state', COALESCE(da.state, 'no_record')
            ) AS drive_axles,
            json_build_object(
              'system_id', 'trailer_brakes',
              'label', 'Trailer Brakes',
              'source_id', tb.source_id,
              'source', tb.source,
              'service_label', tb.service_label,
              'last_service_at', tb.last_service_at,
              'state', COALESCE(tb.state, 'no_record')
            ) AS trailer_brakes,
            json_build_object(
              'system_id', 'trailer_tires',
              'label', 'Trailer Tires',
              'source_id', tt.source_id,
              'source', tt.source,
              'service_label', tt.service_label,
              'last_service_at', tt.last_service_at,
              'state', COALESCE(tt.state, 'no_record')
            ) AS trailer_tires,
            json_build_object(
              'system_id', 'reefer',
              'label', 'Reefer',
              'source_id', rf.source_id,
              'source', rf.source,
              'service_label', rf.service_label,
              'last_service_at', rf.last_service_at,
              'state', COALESCE(rf.state, 'no_record')
            ) AS reefer,
            json_build_object(
              'system_id', 'annual_dot',
              'label', 'Annual DOT',
              'source_id', ad.source_id,
              'source', ad.source,
              'service_label', ad.service_label,
              'last_service_at', ad.last_service_at,
              'state', COALESCE(ad.state, 'no_record')
            ) AS annual_dot
          FROM engine_pm e
          FULL JOIN cab_dvir d ON true
          FULL JOIN steer_tires st ON true
          FULL JOIN drive_axles da ON true
          FULL JOIN trailer_brakes tb ON true
          FULL JOIN trailer_tires tt ON true
          FULL JOIN reefer rf ON true
          FULL JOIN annual_dot ad ON true
          `,
          [query.data.operating_company_id, params.data.id]
        );

        const row = r.rows[0] ?? {};
        return {
          unit: {
            id: unit.id,
            unit_number: unit.unit_number,
            make: unit.make,
            model: unit.model,
            year: unit.year,
          },
          systems: [
            row.engine_pm     ?? { system_id: "engine_pm",       label: "Engine / PM-A",    state: "no_record" },
            row.cab_dvir      ?? { system_id: "cab_dvir",         label: "Cab DVIR",          state: "no_record" },
            row.steer_tires   ?? { system_id: "steer_tires",      label: "Steer Tires",       state: "no_record" },
            row.drive_axles   ?? { system_id: "drive_axles",      label: "Drive Axles",       state: "no_record" },
            row.trailer_brakes?? { system_id: "trailer_brakes",   label: "Trailer Brakes",    state: "no_record" },
            row.trailer_tires ?? { system_id: "trailer_tires",    label: "Trailer Tires",     state: "no_record" },
            row.reefer        ?? { system_id: "reefer",            label: "Reefer",            state: "no_record" },
            row.annual_dot    ?? { system_id: "annual_dot",        label: "Annual DOT",        state: "no_record" },
          ],
        };
      });

      if (!data) return reply.code(404).send({ error: "unit_not_found" });
      return data;
    }
  );
}
