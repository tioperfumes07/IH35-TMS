/**
 * 443.246 CC-1 — Driver Hero endpoint
 * GET /api/v1/drivers/:id/hero?operating_company_id
 *
 * Returns a single-driver dashboard card payload:
 *  - driver chips: status, CDL class/expiry, DOT medical expiry, hazmat, hire date
 *  - current unit + body_style (from units table — same logic as fleet-health)
 *  - live position: city, state, speed, captured_at (vehicle_latest_position)
 *  - loads in-motion + booked-ahead counts
 *  - docs: count of active docs + any expiring within 30 days
 *  - HOS: latest duty_status + started_at
 *  - pre-settlement: open settlement display_id, net_pay estimate
 *
 * 443.218 rule: all aggregate numbers from SQL.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const paramSchema = z.object({ id: z.string().uuid() });
const querySchema = z.object({ operating_company_id: z.string().uuid() });

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

export async function registerDriverHeroRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/drivers/:id/hero",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = authed(req, reply);
      if (!user) return;
      const params = paramSchema.safeParse(req.params);
      if (!params.success) return reply.code(400).send({ error: "invalid_driver_id" });
      const query = querySchema.safeParse(req.query ?? {});
      if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });

      await assertCompanyMembership(user.uuid, query.data.operating_company_id);

      const data = await withCurrentUser(user.uuid, async (client) => {
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [query.data.operating_company_id]);

        /* Verify driver belongs to company */
        const driverRes = await client.query(
          `SELECT d.id::text, d.first_name, d.last_name, d.status,
                  d.cdl_class, d.cdl_expires_at::text, d.dot_medical_expires_at::text,
                  d.hazmat_endorsement_expires_at::text, d.hire_date::text,
                  d.operating_company_id::text
             FROM mdata.drivers d
            WHERE d.id = $1::uuid
              AND d.operating_company_id = $2::uuid
              AND COALESCE(d.archived_at, d.deactivated_at) IS NULL`,
          [params.data.id, query.data.operating_company_id]
        );
        if (!driverRes.rows.length) return null;
        const driver = driverRes.rows[0];

        /* Current unit via open VDA */
        const unitRes = await client.query(
          `SELECT u.id::text AS unit_id, u.unit_number,
                  CASE
                    WHEN (u.make || ' ' || u.model) ~ '389'                 THEN 'classic'
                    WHEN (u.make || ' ' || u.model) ~* 'VOLVO|CASCADIA'     THEN 'sloped'
                    ELSE 'aero'
                  END AS body_style
             FROM telematics.vehicle_driver_assignments vda
             JOIN mdata.units u ON u.id = vda.unit_id
            WHERE vda.driver_id = $1::uuid
              AND vda.ended_at IS NULL
              AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = $2::uuid
            ORDER BY vda.started_at DESC
            LIMIT 1`,
          [params.data.id, query.data.operating_company_id]
        );
        const currentUnit = unitRes.rows[0] ?? null;

        /* Live position — from the unit if we have one */
        let livePosition: Record<string, unknown> | null = null;
        if (currentUnit?.unit_id) {
          const posRes = await client.query(
            `SELECT p.lat, p.lng, p.city, p.state, p.formatted_location,
                    p.speed_mph, p.heading_deg, p.captured_at::text
               FROM telematics.vehicle_latest_position p
              WHERE p.unit_id = $1::uuid
                AND p.operating_company_id = $2::uuid`,
            [currentUnit.unit_id, query.data.operating_company_id]
          );
          livePosition = posRes.rows[0] ?? null;
        }

        /* Loads in-motion + booked-ahead */
        const loadCountRes = await client.query<{ in_motion: number; booked_ahead: number }>(
          `SELECT
             COUNT(*) FILTER (WHERE l.status IN ('in_transit','loaded')) ::int AS in_motion,
             COUNT(*) FILTER (WHERE l.status IN ('scheduled','pending_pickup'))::int AS booked_ahead
           FROM mdata.loads l
           JOIN mdata.load_driver_assignments lda ON lda.load_id = l.id
          WHERE lda.driver_id = $1::uuid
            AND l.operating_company_id = $2::uuid
            AND l.voided_at IS NULL`,
          [params.data.id, query.data.operating_company_id]
        );
        const loadCounts = loadCountRes.rows[0] ?? { in_motion: 0, booked_ahead: 0 };

        /* Documents: total active + expiring within 30 days */
        const docsRes = await client.query<{ active_count: number; expiring_soon_count: number }>(
          `SELECT
             COUNT(*)                                                      ::int AS active_count,
             COUNT(*) FILTER (WHERE dd.expiry_date <= CURRENT_DATE + 30)  ::int AS expiring_soon_count
           FROM safety.driver_documents dd
          WHERE dd.driver_id = $1::uuid
            AND dd.operating_company_id = $2::uuid
            AND dd.voided_at IS NULL`,
          [params.data.id, query.data.operating_company_id]
        );
        const docs = docsRes.rows[0] ?? { active_count: 0, expiring_soon_count: 0 };

        /* HOS: latest duty status */
        const hosRes = await client.query(
          `SELECT dse.duty_status, dse.started_at::text
             FROM hos.duty_status_events dse
            WHERE dse.driver_id = $1::uuid
              AND dse.operating_company_id = $2::uuid
            ORDER BY dse.started_at DESC
            LIMIT 1`,
          [params.data.id, query.data.operating_company_id]
        );
        const hos = hosRes.rows[0] ?? null;

        /* Pre-settlement: latest open settlement */
        const settlementRes = await client.query(
          `SELECT ds.id::text, ds.display_id, ds.net_pay::text, ds.period_start::text, ds.period_end::text, ds.status
             FROM driver_finance.driver_settlements ds
            WHERE ds.driver_id = $1::uuid
              AND ds.operating_company_id = $2::uuid
              AND ds.voided_at IS NULL
              AND ds.status IN ('open','pending_approval')
            ORDER BY ds.period_start DESC
            LIMIT 1`,
          [params.data.id, query.data.operating_company_id]
        );
        const preSettlement = settlementRes.rows[0] ?? null;

        return {
          driver: {
            id: driver.id,
            first_name: driver.first_name,
            last_name: driver.last_name,
            status: driver.status,
            chips: {
              cdl_class: driver.cdl_class,
              cdl_expires_at: driver.cdl_expires_at,
              dot_medical_expires_at: driver.dot_medical_expires_at,
              hazmat_endorsement_expires_at: driver.hazmat_endorsement_expires_at,
              hire_date: driver.hire_date,
            },
          },
          current_unit: currentUnit,
          live_position: livePosition,
          loads: loadCounts,
          docs,
          hos,
          pre_settlement: preSettlement,
        };
      });

      if (!data) return reply.code(404).send({ error: "driver_not_found" });
      return data;
    }
  );
}
