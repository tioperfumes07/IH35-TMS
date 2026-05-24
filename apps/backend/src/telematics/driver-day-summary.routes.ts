import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const querySchema = z.object({
  operating_company_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

function currentUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function validationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

export async function registerDriverDaySummaryRoutes(app: FastifyInstance) {
  app.get("/api/v1/telematics/driver-day-summary", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const serviceDate = query.data.date ?? new Date().toISOString().slice(0, 10);

    const rows = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [query.data.operating_company_id]);
      const res = await client.query<{
        driver_id: string;
        driver_name: string;
        miles: number;
        hours_on_duty: number;
        fuel_stops: number;
        on_time_arrivals: number;
        late_arrivals: number;
      }>(
        `
          WITH bounds AS (
            SELECT
              $2::date::timestamptz AS day_start,
              ($2::date::timestamptz + interval '1 day') AS day_end
          ),
          mileage AS (
            SELECT
              a.driver_id,
              COALESCE(SUM(
                CASE
                  WHEN p.prev_lat IS NULL OR p.prev_lng IS NULL THEN 0
                  WHEN p.prev_ts IS NULL OR p.prev_ts < b.day_start THEN 0
                  ELSE (
                    3958.7613 * 2 * asin(
                      sqrt(
                        power(sin(radians((p.lat - p.prev_lat) / 2)), 2) +
                        cos(radians(p.prev_lat)) * cos(radians(p.lat)) *
                        power(sin(radians((p.lng - p.prev_lng) / 2)), 2)
                      )
                    )
                  )
                END
              ), 0)::numeric AS miles
            FROM (
              SELECT
                v.unit_id,
                v.captured_at,
                v.lat::float8 AS lat,
                v.lng::float8 AS lng,
                lag(v.lat::float8) OVER (PARTITION BY v.operating_company_id, v.unit_id ORDER BY v.captured_at) AS prev_lat,
                lag(v.lng::float8) OVER (PARTITION BY v.operating_company_id, v.unit_id ORDER BY v.captured_at) AS prev_lng,
                lag(v.captured_at) OVER (PARTITION BY v.operating_company_id, v.unit_id ORDER BY v.captured_at) AS prev_ts
              FROM telematics.vehicle_locations v
              CROSS JOIN bounds b
              WHERE v.operating_company_id = $1::uuid
                AND v.captured_at >= b.day_start
                AND v.captured_at < b.day_end
            ) p
            CROSS JOIN bounds b
            JOIN telematics.vehicle_driver_assignments a
              ON a.operating_company_id = $1::uuid
             AND a.unit_id = p.unit_id
             AND a.started_at <= p.captured_at
             AND (a.ended_at IS NULL OR a.ended_at > p.captured_at)
             AND a.driver_id IS NOT NULL
            GROUP BY a.driver_id
          ),
          duty AS (
            SELECT
              e.driver_id,
              COALESCE(SUM(
                EXTRACT(
                  EPOCH FROM
                  (LEAST(COALESCE(e.ended_at, b.day_end), b.day_end) - GREATEST(e.started_at, b.day_start))
                ) / 3600.0
              ), 0)::numeric AS hours_on_duty
            FROM hos.duty_status_events e
            CROSS JOIN bounds b
            WHERE e.operating_company_id = $1::uuid
              AND e.duty_status IN ('on_duty', 'driving')
              AND e.started_at < b.day_end
              AND COALESCE(e.ended_at, b.day_end) > b.day_start
            GROUP BY e.driver_id
          ),
          fuel_stops AS (
            SELECT
              ft.driver_id,
              count(*)::int AS fuel_stops
            FROM fuel.fuel_transactions ft
            CROSS JOIN bounds b
            WHERE ft.operating_company_id = $1::uuid
              AND ft.driver_id IS NOT NULL
              AND ft.purchased_at >= b.day_start
              AND ft.purchased_at < b.day_end
            GROUP BY ft.driver_id
          ),
          arrivals AS (
            SELECT
              sa.driver_id,
              count(*) FILTER (WHERE sa.triggered_at <= COALESCE(ls.appointment_end_at, ls.scheduled_arrival_at, ls.appointment_start_at))::int AS on_time_arrivals,
              count(*) FILTER (WHERE sa.triggered_at > COALESCE(ls.appointment_end_at, ls.scheduled_arrival_at, ls.appointment_start_at))::int AS late_arrivals
            FROM dispatch.stop_arrivals sa
            JOIN mdata.load_stops ls ON ls.id = sa.stop_id
            CROSS JOIN bounds b
            WHERE sa.operating_company_id = $1::uuid
              AND sa.driver_id IS NOT NULL
              AND sa.triggered_at >= b.day_start
              AND sa.triggered_at < b.day_end
            GROUP BY sa.driver_id
          ),
          all_drivers AS (
            SELECT driver_id FROM mileage
            UNION
            SELECT driver_id FROM duty
            UNION
            SELECT driver_id FROM fuel_stops
            UNION
            SELECT driver_id FROM arrivals
          )
          SELECT
            d.id::text AS driver_id,
            trim(concat(coalesce(d.first_name, ''), ' ', coalesce(d.last_name, ''))) AS driver_name,
            COALESCE(round(m.miles, 1), 0)::numeric AS miles,
            COALESCE(round(dt.hours_on_duty, 2), 0)::numeric AS hours_on_duty,
            COALESCE(fs.fuel_stops, 0)::int AS fuel_stops,
            COALESCE(ar.on_time_arrivals, 0)::int AS on_time_arrivals,
            COALESCE(ar.late_arrivals, 0)::int AS late_arrivals
          FROM all_drivers ad
          JOIN mdata.drivers d
            ON d.id = ad.driver_id
           AND d.operating_company_id = $1::uuid
          LEFT JOIN mileage m ON m.driver_id = ad.driver_id
          LEFT JOIN duty dt ON dt.driver_id = ad.driver_id
          LEFT JOIN fuel_stops fs ON fs.driver_id = ad.driver_id
          LEFT JOIN arrivals ar ON ar.driver_id = ad.driver_id
          ORDER BY miles DESC, driver_name ASC
        `,
        [query.data.operating_company_id, serviceDate]
      );
      return res.rows;
    });

    return { date: serviceDate, rows };
  });
}
