import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { getCurrentClocks } from "./hos-clocks.service.js";

const querySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const paramsSchema = z.object({
  driver_id: z.string().uuid(),
});

// Batched fleet HOS for the dispatch board — one call returns the cycle clocks for every visible
// driver, so the board's "Hrs available (cycle)" / "Hrs to reset" columns light up without an
// N+1 fan-out. Per-entity scoped; reuses the in-app HOS store (no Samsara, no separate feed).
const batchQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  driver_ids: z
    .string()
    .min(1)
    .transform((raw) => Array.from(new Set(raw.split(",").map((id) => id.trim()).filter(Boolean))))
    .refine((ids) => ids.length > 0 && ids.length <= 200, "driver_ids must contain 1–200 ids")
    .refine((ids) => ids.every((id) => /^[0-9a-fA-F-]{36}$/.test(id)), "driver_ids must be uuids"),
});

// Batched last-known GPS positions for the dispatch board (keyed by load).
const batchLoadQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  load_ids: z
    .string()
    .min(1)
    .transform((raw) => Array.from(new Set(raw.split(",").map((id) => id.trim()).filter(Boolean))))
    .refine((ids) => ids.length > 0 && ids.length <= 200, "load_ids must contain 1–200 ids")
    .refine((ids) => ids.every((id) => /^[0-9a-fA-F-]{36}$/.test(id)), "load_ids must be uuids"),
});

function currentUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function validationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

export async function registerTelematicsHosRoutes(app: FastifyInstance) {
  app.get("/api/v1/telematics/drivers/:driver_id/hos", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const params = paramsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const payload = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [query.data.operating_company_id]);
      await client.query(`SELECT set_config('app.user_role', $1, true)`, [user.role]);

      const driverRes = await client.query<{ id: string }>(
        `
          SELECT id::text AS id
          FROM mdata.drivers
          WHERE id = $1::uuid
            AND operating_company_id = $2::uuid
          LIMIT 1
        `,
        [params.data.driver_id, query.data.operating_company_id]
      );
      if (!driverRes.rows[0]) return null;

      const clocks = await getCurrentClocks(client, query.data.operating_company_id, params.data.driver_id);
      const events24hRes = await client.query<{
        id: string;
        duty_status: string;
        started_at: string;
        ended_at: string | null;
        unit_id: string | null;
        source: string;
        odometer_mi: number | null;
        location: string | null;
      }>(
        `
          SELECT
            id::text,
            duty_status,
            started_at::text,
            ended_at::text,
            unit_id::text,
            source,
            odometer_mi,
            location
          FROM hos.duty_status_events
          WHERE operating_company_id = $1::uuid
            AND driver_id = $2::uuid
            AND started_at >= now() - interval '24 hours'
          ORDER BY started_at DESC
        `,
        [query.data.operating_company_id, params.data.driver_id]
      );
      const summary8dRes = await client.query<{
        service_day: string;
        duty_status: string;
        total_minutes: number;
      }>(
        `
          SELECT
            to_char(date_trunc('day', started_at), 'YYYY-MM-DD') AS service_day,
            duty_status,
            FLOOR(
              SUM(
                EXTRACT(
                  EPOCH FROM
                  (
                    LEAST(COALESCE(ended_at, now()), now())
                    - GREATEST(started_at, now() - interval '8 days')
                  )
                ) / 60.0
              )
            )::int AS total_minutes
          FROM hos.duty_status_events
          WHERE operating_company_id = $1::uuid
            AND driver_id = $2::uuid
            AND started_at < now()
            AND COALESCE(ended_at, now()) > now() - interval '8 days'
          GROUP BY 1, 2
          ORDER BY service_day DESC, duty_status
        `,
        [query.data.operating_company_id, params.data.driver_id]
      );
      const manualEditsRes = await client.query<{
        id: string;
        started_at: string;
        duty_status: string;
      }>(
        `
          SELECT id::text, started_at::text, duty_status
          FROM hos.duty_status_events
          WHERE operating_company_id = $1::uuid
            AND driver_id = $2::uuid
            AND source = 'manual_edit'
          ORDER BY started_at DESC
          LIMIT 100
        `,
        [query.data.operating_company_id, params.data.driver_id]
      );

      return {
        driver_id: params.data.driver_id,
        clocks,
        timeline_24h: events24hRes.rows,
        summary_8d: summary8dRes.rows,
        manual_edits: {
          count: manualEditsRes.rows.length,
          requires_supervisor_signoff: true,
          events: manualEditsRes.rows,
        },
      };
    });

    if (!payload) return reply.code(404).send({ error: "driver_not_found" });
    return payload;
  });

  // Batched cycle clocks for the dispatch board (read-only). Returns only the two values the
  // board needs per driver plus the status flag for green/amber. Drivers not in this entity are
  // simply absent from the map (RLS + operating_company filter prevent cross-entity reads).
  app.get("/api/v1/dispatch/hos-clocks", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const query = batchQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const payload = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [query.data.operating_company_id]);
      await client.query(`SELECT set_config('app.user_role', $1, true)`, [user.role]);

      // Confine to drivers that actually belong to this operating company.
      const driverRes = await client.query<{ id: string }>(
        `
          SELECT id::text AS id
          FROM mdata.drivers
          WHERE operating_company_id = $1::uuid
            AND id = ANY($2::uuid[])
        `,
        [query.data.operating_company_id, query.data.driver_ids]
      );

      const clocksByDriver: Record<string, { cycle_remaining_min: number; cycle_reset_in_min: number | null; status: string }> = {};
      for (const row of driverRes.rows) {
        const clocks = await getCurrentClocks(client, query.data.operating_company_id, row.id);
        clocksByDriver[row.id] = {
          cycle_remaining_min: clocks.cycle_remaining_min,
          cycle_reset_in_min: clocks.cycle_reset_in_min,
          status: clocks.status,
        };
      }
      return { clocks_by_driver: clocksByDriver };
    });

    return payload;
  });

  // Batched last-known GPS positions for the dispatch board's Live GPS column — one call returns
  // the latest in-app position (from integrations.samsara_vehicle_positions) for every visible
  // load's assigned unit. Per-entity scoped. Replaces the hardcoded null stub on the board.
  app.get("/api/v1/dispatch/load-positions", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const query = batchLoadQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const payload = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [query.data.operating_company_id]);
      await client.query(`SELECT set_config('app.user_role', $1, true)`, [user.role]);

      // Latest position per load via its assigned unit. Confined to this entity's loads + positions.
      const res = await client.query<{
        load_id: string;
        lat: number;
        lng: number;
        speed_mph: number | null;
        recorded_at: string;
        stale: boolean;
      }>(
        `
          SELECT
            l.id::text AS load_id,
            p.lat,
            p.lng,
            p.speed_mph,
            p.recorded_at::text AS recorded_at,
            (p.recorded_at < now() - interval '15 minutes') AS stale
          FROM mdata.loads l
          JOIN integrations.samsara_vehicle_positions p
            ON p.unit_uuid = l.assigned_unit_id
            AND p.operating_company_id = l.operating_company_id
          WHERE l.operating_company_id = $1::uuid
            AND l.id = ANY($2::uuid[])
            AND l.assigned_unit_id IS NOT NULL
        `,
        [query.data.operating_company_id, query.data.load_ids]
      );

      const positionsByLoad: Record<string, { lat: number; lng: number; speed_mph: number | null; recorded_at: string; stale: boolean }> = {};
      for (const row of res.rows) {
        positionsByLoad[row.load_id] = {
          lat: row.lat,
          lng: row.lng,
          speed_mph: row.speed_mph,
          recorded_at: row.recorded_at,
          stale: row.stale,
        };
      }
      return { positions_by_load: positionsByLoad };
    });

    return payload;
  });
}
