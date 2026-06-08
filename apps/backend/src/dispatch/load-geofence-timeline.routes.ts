import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";
import { computeDetentionBillableMinutes } from "./detention.lib.js";

const paramsSchema = z.object({ loadId: z.string().uuid() });
const querySchema = z.object({ operating_company_id: z.string().uuid() });

const LAYOVER_THRESHOLD_MINUTES = 480;

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sourceLabel(raw: string | null): "geofence" | "driver_pwa" | "dispatcher_manual" {
  if (raw === "samsara_gps") return "geofence";
  if (raw === "driver_pwa") return "driver_pwa";
  return "dispatcher_manual";
}

export async function registerLoadGeofenceTimelineRoutes(app: FastifyInstance) {
  app.get("/api/v1/dispatch/loads/:loadId/geofence-timeline", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;

    const params = paramsSchema.safeParse(req.params ?? {});
    const query = querySchema.safeParse(req.query ?? {});
    if (!params.success || !query.success) {
      return reply.code(400).send({ error: "validation_error" });
    }

    const { loadId } = params.data;
    const { operating_company_id } = query.data;

    const result = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operating_company_id]);

      const loadRes = await client.query<{ id: string }>(
        `SELECT id FROM mdata.loads
         WHERE id = $1 AND operating_company_id = $2 AND soft_deleted_at IS NULL
         LIMIT 1`,
        [loadId, operating_company_id]
      );
      if (!loadRes.rows[0]) return null;

      // Load stops (pickup + delivery only for the timeline)
      const stopsRes = await client.query<{
        stop_id: string;
        sequence_number: number;
        stop_type: string;
        city: string | null;
        state: string | null;
        actual_arrival_at: string | null;
        actual_departure_at: string | null;
        scheduled_arrival_at: string | null;
        status: string;
      }>(
        `SELECT
           ls.id::text AS stop_id,
           ls.sequence_number,
           ls.stop_type::text,
           ls.city,
           ls.state,
           ls.actual_arrival_at::text,
           ls.actual_departure_at::text,
           ls.scheduled_arrival_at::text,
           ls.status::text
         FROM mdata.load_stops ls
         WHERE ls.load_id = $1
           AND ls.stop_type IN ('pickup', 'delivery')
         ORDER BY ls.sequence_number ASC`,
        [loadId]
      );

      // Detention events keyed by stop_id
      const detentionRes = await client.query<{
        stop_id: string;
        detention_status: string;
        free_time_minutes: number;
        started_at: string;
        stopped_at: string | null;
      }>(
        `SELECT
           de.stop_id::text,
           de.status::text AS detention_status,
           de.free_time_minutes,
           de.started_at::text,
           de.stopped_at::text
         FROM dispatch.detention_events de
         WHERE de.load_id = $1
           AND de.operating_company_id = $2`,
        [loadId, operating_company_id]
      );

      const detentionByStop = new Map(detentionRes.rows.map((r) => [r.stop_id, r]));

      // Geofence events — bound auto-geofences are labelled "load-{loadId}-stop-{sequence}"
      // Pull entered/exited pairs and the source of the first geofence event per stop
      const geoRes = await client.query<{
        sequence_number: number;
        geo_entered_at: string | null;
        geo_exited_at: string | null;
        geo_source: string | null;
      }>(
        `SELECT
           CAST(REGEXP_REPLACE(g.label, '^load-[^-]+-stop-', '') AS integer) AS sequence_number,
           MIN(CASE WHEN ge.event_kind = 'entered' THEN ge.occurred_at::text END) AS geo_entered_at,
           MAX(CASE WHEN ge.event_kind = 'exited'  THEN ge.occurred_at::text END) AS geo_exited_at,
           MAX(ge.source::text) AS geo_source
         FROM geo.geofences g
         JOIN geo.geofence_events ge
           ON ge.geofence_id = g.id
          AND ge.operating_company_id = $2
         WHERE g.operating_company_id = $2
           AND g.label LIKE $3
         GROUP BY g.label`,
        [loadId, operating_company_id, `load-${loadId}-stop-%`]
      );

      const geoBySeq = new Map(geoRes.rows.map((r) => [r.sequence_number, r]));

      const stops = stopsRes.rows.map((stop) => {
        const det = detentionByStop.get(stop.stop_id) ?? null;
        const geo = geoBySeq.get(stop.sequence_number) ?? null;

        const arrivedAt = geo?.geo_entered_at ?? stop.actual_arrival_at ?? null;
        const departedAt = geo?.geo_exited_at ?? stop.actual_departure_at ?? null;

        let dwellMinutes: number | null = null;
        if (arrivedAt && departedAt) {
          dwellMinutes = Math.round(
            (new Date(departedAt).getTime() - new Date(arrivedAt).getTime()) / 60_000
          );
        }

        const freeTimeMinutes = det ? Number(det.free_time_minutes) : 120;

        let detentionMinutes = 0;
        if (det && arrivedAt) {
          detentionMinutes = computeDetentionBillableMinutes({
            started_at: det.started_at,
            stopped_at: det.stopped_at ?? departedAt,
            free_time_minutes: freeTimeMinutes,
          });
        } else if (dwellMinutes !== null && dwellMinutes > freeTimeMinutes) {
          detentionMinutes = dwellMinutes - freeTimeMinutes;
        }

        return {
          stop_id: stop.stop_id,
          sequence: stop.sequence_number,
          stop_type: stop.stop_type,
          city: stop.city ?? null,
          state: stop.state ?? null,
          arrived_at: arrivedAt,
          departed_at: departedAt,
          scheduled_arrival_at: stop.scheduled_arrival_at ?? null,
          dwell_minutes: dwellMinutes,
          free_time_minutes: freeTimeMinutes,
          detention_minutes: detentionMinutes,
          detention_status: (det?.detention_status ?? null) as "accruing" | "closed" | "billed" | null,
          is_layover: dwellMinutes !== null && dwellMinutes > LAYOVER_THRESHOLD_MINUTES,
          source: sourceLabel(geo?.geo_source ?? null),
          stop_status: stop.status,
        };
      });

      return { stops, load_free_time_minutes: 120 };
    });

    if (!result) return reply.code(404).send({ error: "load_not_found" });
    return reply.send(result);
  });
}
