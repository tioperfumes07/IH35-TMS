import { setScopedCompanyContext } from "../_helpers/scoped-company-context.js";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { STOP_FENCE_LABEL_RE_SQL } from "./stop-arrival-events.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const querySchema = z.object({
  operating_company_id: z.string().uuid(),
  date: z.string().regex(ISO_DATE),
});

export const driverDaySummaryRowSchema = z.object({
  driver_id: z.string().uuid(),
  driver_name: z.string(),
  miles: z.number(),
  hours_on_duty: z.number(),
  fuel_stops: z.number(),
  on_time_arrivals: z.number(),
  late_arrivals: z.number(),
});

export const driverDaySummaryResponseSchema = z.object({
  date: z.string().regex(ISO_DATE),
  has_data: z.boolean(),
  rows: z.array(driverDaySummaryRowSchema),
});

export type DriverDaySummaryResponse = z.infer<typeof driverDaySummaryResponseSchema>;

function currentUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function validationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function toNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

const DRIVER_DAY_SUMMARY_SQL = `
          WITH bounds AS (
            SELECT
              $2::date::timestamptz AS day_start,
              ($2::date::timestamptz + interval '1 day') AS day_end
          ),
          -- ROW 184 (LEAD 11-03): only the assignments that overlap the day. A position inside
          -- [day_start, day_end) can only be covered by one of these, so the join below is identical,
          -- but it probes a handful of rows instead of every historical assignment per GPS point
          -- (measured: 8,261 index probes / 159,465 buffers for one day).
          day_assignments AS MATERIALIZED (
            SELECT a.unit_id, a.driver_id, a.started_at, a.ended_at
            FROM telematics.vehicle_driver_assignments a
            CROSS JOIN bounds b
            WHERE a.operating_company_id = $1::uuid
              AND a.driver_id IS NOT NULL
              AND a.started_at < b.day_end
              AND (a.ended_at IS NULL OR a.ended_at > b.day_start)
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
            JOIN day_assignments a
              ON a.unit_id = p.unit_id
             AND a.started_at <= p.captured_at
             AND (a.ended_at IS NULL OR a.ended_at > p.captured_at)
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
          -- ROW 184 (LEAD 11-03): the day's FIRST arrival per (stop, unit), bounded to the day.
          -- Same definition as STOP_ARRIVAL_EVENTS_SQL (first 'entered' on the stop's E-25 fence, DISTINCT ON
          -- stop+unit) filtered to triggered_at in the day — but computed set-based from the day's entered
          -- events plus a NOT EXISTS "no earlier entry" probe, instead of materialising every arrival in
          -- history (all 10k+ entered events, a per-event audit lateral and a per-event departure subquery)
          -- and filtering after. Measured on prod under the app role: the unbounded derived table was
          -- 11,141 ms of the 11,247 ms request (planner mis-estimated the RLS-filtered fences as 1 row and
          -- seq-scanned geo.geofence_events 843 times).
          -- The stop <-> fence map, computed ONCE (the label regex over geo.geofences is the expensive
          -- part; doing it per candidate arrival would reintroduce the per-row scan). Both sides are
          -- materialised first: under RLS the planner estimates the fence scan as 1 row and picks a nested
          -- loop, and re-scanning RLS-filtered mdata.load_stops once per fence cost 4,400 ms (measured 10-19);
          -- re-scanning a 410-row tuplestore costs nothing.
          --
          -- ROW 124 (CC-2 11-13): arrivals block measured ~270 ms. Root: stop_fence_keys regex-scanned ALL
          -- geo.geofences (26,342 on prod 11-13) to find 983 stop-label fences. Fix: day_geofence_ids first
          -- collects only the distinct fences that fired an 'entered' event today (~86 on 11-13) using the
          -- existing ix_geo_geofence_events_company_lookup index; stop_fence_keys then PK-looks up only those
          -- 86 and regexes them — a ~300x reduction in scanned rows.
          live_stops AS MATERIALIZED (
            SELECT ls.id, ls.load_id, ls.sequence_number
            FROM mdata.load_stops ls
            WHERE ls.soft_deleted_at IS NULL
          ),
          -- ROW 124: narrow geofence label scan to fences that actually fired today
          day_geofence_ids AS MATERIALIZED (
            SELECT DISTINCT ge.geofence_id
            FROM geo.geofence_events ge
            CROSS JOIN bounds b
            WHERE ge.operating_company_id = $1::uuid
              AND ge.event_kind = 'entered'
              AND ge.occurred_at >= b.day_start
              AND ge.occurred_at < b.day_end
          ),
          -- ROW 124b (CC-2 11-13): planner estimated day_geofence_ids=5001 rows (actual 90) and
          -- chose Hash Join building from geo.geofences (regex scan of all 26,342 rows, 580 ms).
          -- LATERAL forces 90 PK index lookups + regex on those 90 strings → ~9 ms.
          stop_fence_keys AS MATERIALIZED (
            SELECT g.id AS geofence_id,
                   substring(g.label FROM '^load-([0-9a-f-]{36})-stop-')::uuid AS load_id,
                   substring(g.label FROM '-stop-([0-9]+)$')::int AS sequence_number
            FROM day_geofence_ids dgi
            JOIN LATERAL (
              SELECT id, label FROM geo.geofences WHERE id = dgi.geofence_id
            ) g ON g.label ~ '${STOP_FENCE_LABEL_RE_SQL}'
          ),
          stop_fences AS MATERIALIZED (
            SELECT k.geofence_id, s.id AS stop_id
            FROM stop_fence_keys k
            JOIN live_stops s ON s.load_id = k.load_id AND s.sequence_number = k.sequence_number
          ),
          day_entries AS MATERIALIZED (
            SELECT DISTINCT ON (sf.stop_id, ge.unit_id)
                   ge.operating_company_id,
                   sf.stop_id,
                   ge.unit_id,
                   ge.driver_id,
                   ge.occurred_at AS triggered_at
            FROM geo.geofence_events ge
            CROSS JOIN bounds b
            JOIN stop_fences sf ON sf.geofence_id = ge.geofence_id
            WHERE ge.operating_company_id = $1::uuid
              AND ge.event_kind = 'entered'
              AND ge.occurred_at >= b.day_start
              AND ge.occurred_at < b.day_end
            -- Deterministic tie-break: two fences can carry the same stop label and fire at the same
            -- instant (measured 10-19: stop c3565355… entered twice at 15:52:33, once with the driver,
            -- once with driver_id NULL). Prefer the driver-attributed event, then the lowest id.
            ORDER BY sf.stop_id, ge.unit_id, ge.occurred_at, (ge.driver_id IS NULL), ge.id
          ),
          arrivals AS (
            SELECT
              sa.driver_id,
              count(*) FILTER (WHERE sa.triggered_at <= COALESCE(ls.appointment_end_at, ls.scheduled_arrival_at, ls.appointment_start_at))::int AS on_time_arrivals,
              count(*) FILTER (WHERE sa.triggered_at > COALESCE(ls.appointment_end_at, ls.scheduled_arrival_at, ls.appointment_start_at))::int AS late_arrivals
            FROM day_entries sa
            JOIN mdata.load_stops ls ON ls.id = sa.stop_id
            WHERE sa.operating_company_id = $1::uuid
              AND sa.driver_id IS NOT NULL
              -- first-ever entry only: no earlier 'entered' by this unit on any fence of this stop
              AND NOT EXISTS (
                SELECT 1
                FROM stop_fences sfx
                JOIN geo.geofence_events x ON x.geofence_id = sfx.geofence_id
                WHERE sfx.stop_id = sa.stop_id
                  AND x.operating_company_id = $1::uuid
                  AND x.unit_id = sa.unit_id
                  AND x.event_kind = 'entered'
                  AND x.occurred_at < sa.triggered_at
              )
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
           AND d.archived_at IS NULL
           AND (
             d.operating_company_id = $1::uuid
             OR EXISTS (
               SELECT 1 FROM mdata.driver_company_authorizations day_summary_dca
               WHERE day_summary_dca.driver_id = d.id
                 AND day_summary_dca.company_id = $1::uuid
                 AND day_summary_dca.is_authorized = true
                 AND day_summary_dca.deactivated_at IS NULL
             )
           )
          LEFT JOIN mileage m ON m.driver_id = ad.driver_id
          LEFT JOIN duty dt ON dt.driver_id = ad.driver_id
          LEFT JOIN fuel_stops fs ON fs.driver_id = ad.driver_id
          LEFT JOIN arrivals ar ON ar.driver_id = ad.driver_id
          ORDER BY miles DESC, driver_name ASC
        `;

export async function registerDriverDaySummaryRoutes(app: FastifyInstance) {
  app.get("/api/v1/telematics/driver-day-summary", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;

    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const { operating_company_id: operatingCompanyId, date: serviceDate } = query.data;

    try {
      const rows = await withCurrentUser(user.uuid, async (client) => {
        await setScopedCompanyContext(client, user.uuid, operatingCompanyId);
        const res = await client.query<{
          driver_id: string;
          driver_name: string;
          miles: number;
          hours_on_duty: number;
          fuel_stops: number;
          on_time_arrivals: number;
          late_arrivals: number;
        }>(DRIVER_DAY_SUMMARY_SQL, [operatingCompanyId, serviceDate]);
        return res.rows;
      });

      const normalizedRows = rows.map((row) => ({
        driver_id: row.driver_id,
        driver_name: row.driver_name.trim() || "Unknown driver",
        miles: toNumber(row.miles),
        hours_on_duty: toNumber(row.hours_on_duty),
        fuel_stops: toNumber(row.fuel_stops),
        on_time_arrivals: toNumber(row.on_time_arrivals),
        late_arrivals: toNumber(row.late_arrivals),
      }));

      const payload: DriverDaySummaryResponse = {
        date: serviceDate,
        has_data: normalizedRows.length > 0,
        rows: normalizedRows,
      };

      const parsed = driverDaySummaryResponseSchema.safeParse(payload);
      if (!parsed.success) {
        req.log.error({ err: parsed.error.flatten() }, "driver-day-summary response shape mismatch");
        return reply.code(500).send({ error: "internal_error", message: "Unexpected response shape" });
      }

      return parsed.data;
    } catch (err) {
      req.log.error({ err }, "driver-day-summary query failed");
      return reply.code(500).send({ error: "internal_error", message: "Failed to load driver day summary" });
    }
  });
}
