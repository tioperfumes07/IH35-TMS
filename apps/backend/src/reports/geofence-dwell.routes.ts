import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";

const querySchema = companyQuerySchema.extend({
  period_start: z.string().date(),
  period_end: z.string().date(),
  geofence_id: z.string().uuid().optional(),
  location_kind: z.enum(["customer_site", "yard", "vendor_site", "custom"]).optional(),
});

export async function registerGeofenceDwellRoutes(app: FastifyInstance) {
  app.get("/api/v1/reports/geofence-dwell", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const parsed = querySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const payload = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
      const filters: string[] = [
        "ev.operating_company_id = $1::uuid",
        "ev.occurred_at >= $2::date",
        "ev.occurred_at < ($3::date + INTERVAL '1 day')",
      ];
      const params: unknown[] = [parsed.data.operating_company_id, parsed.data.period_start, parsed.data.period_end];
      if (parsed.data.geofence_id) {
        params.push(parsed.data.geofence_id);
        filters.push(`ev.geofence_id = $${params.length}::uuid`);
      }
      if (parsed.data.location_kind) {
        params.push(parsed.data.location_kind);
        filters.push(`gf.location_kind = $${params.length}`);
      }

      const whereSql = `WHERE ${filters.join(" AND ")}`;
      const res = await client.query(
        `
          WITH ordered AS (
            SELECT
              ev.geofence_id,
              ev.unit_id,
              ev.driver_id,
              ev.event_kind::text,
              ev.occurred_at,
              LEAD(ev.event_kind::text) OVER (PARTITION BY ev.geofence_id, ev.unit_id ORDER BY ev.occurred_at, ev.created_at) AS next_kind,
              LEAD(ev.occurred_at) OVER (PARTITION BY ev.geofence_id, ev.unit_id ORDER BY ev.occurred_at, ev.created_at) AS exit_at
            FROM geo.geofence_events ev
            JOIN geo.geofences gf ON gf.id = ev.geofence_id
            ${whereSql}
          )
          SELECT
            gf.id::text AS geofence_id,
            gf.label AS geofence_label,
            gf.location_kind,
            gf.location_ref_id::text,
            u.id::text AS unit_id,
            u.unit_number,
            o.driver_id::text,
            d.first_name,
            d.last_name,
            o.occurred_at::text AS entered_at,
            CASE WHEN o.next_kind = 'exited' THEN o.exit_at::text ELSE NULL END AS exited_at,
            CASE
              WHEN o.next_kind = 'exited'
              THEN GREATEST(0, ROUND(EXTRACT(EPOCH FROM (o.exit_at - o.occurred_at)) / 60.0))::int
              ELSE NULL
            END AS dwell_minutes
          FROM ordered o
          JOIN geo.geofences gf ON gf.id = o.geofence_id
          JOIN mdata.units u ON u.id = o.unit_id
          LEFT JOIN mdata.drivers d ON d.id = o.driver_id
          WHERE o.event_kind = 'entered'
          ORDER BY o.occurred_at DESC
        `,
        params
      );
      return res.rows;
    });

    return {
      period: { start: parsed.data.period_start, end: parsed.data.period_end },
      rows: payload,
    };
  });
}
