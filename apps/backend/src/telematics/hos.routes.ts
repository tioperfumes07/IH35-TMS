import { setScopedCompanyContext } from "../_helpers/scoped-company-context.js";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { computeDailyDutySummary, getCurrentClocks, type HosDutyStatusEvent } from "./hos-clocks.service.js";

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
  if (!requireAuth(req, reply)) return reply;
  return req.user;
}

function validationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

export async function registerTelematicsHosRoutes(app: FastifyInstance) {
  app.get("/api/v1/telematics/drivers/:driver_id/hos", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const params = paramsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const payload = await withCurrentUser(user.uuid, async (client) => {
      await setScopedCompanyContext(client, user.uuid, query.data.operating_company_id);
      await client.query(`SELECT set_config('app.user_role', $1::text, true)`, [user.role]);

      const driverRes = await client.query<{ id: string }>(
        `
          SELECT id::text AS id
          FROM mdata.drivers d
          WHERE d.id = $1::uuid
            AND d.archived_at IS NULL
            AND (
              d.operating_company_id = $2::uuid
              OR EXISTS (
                SELECT 1 FROM mdata.driver_company_authorizations dca
                WHERE dca.driver_id = d.id
                  AND dca.company_id = $2::uuid
                  AND dca.is_authorized = true
                  AND dca.deactivated_at IS NULL
              )
            )
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
        unit_number: string | null;
        source: string;
        odometer_mi: number | null;
        location: string | null;
      }>(
        `
          SELECT
            e.id::text,
            e.duty_status,
            e.started_at::text,
            e.ended_at::text,
            e.unit_id::text,
            u.unit_number,
            e.source,
            e.odometer_mi,
            e.location
          FROM hos.duty_status_events e
          LEFT JOIN mdata.units u
            ON u.id = e.unit_id
            AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = e.operating_company_id
          WHERE e.operating_company_id = $1::uuid
            AND e.driver_id = $2::uuid
            AND e.started_at >= now() - interval '24 hours'
          ORDER BY e.started_at DESC
        `,
        [query.data.operating_company_id, params.data.driver_id]
      );
      // HOS-F6312: the daily summary is derived from flattenDutySegments() — the SAME
      // non-overlapping reconstruction the clocks panel above already requires — not a raw SQL SUM
      // over the append-only event rows. ELD ingest legitimately writes overlapping/duplicate rows
      // for one real duty period; summing them directly produces impossible per-day totals (a
      // single day showing 140+ hours). Fetch with a lookback buffer beyond the 8-day window so a
      // segment that started earlier still gets its correct flattened boundary before being clipped
      // to the window in computeDailyDutySummary().
      const summary8dEventsRes = await client.query<HosDutyStatusEvent>(
        `
          SELECT started_at::text, ended_at::text, duty_status
          FROM hos.duty_status_events
          WHERE operating_company_id = $1::uuid
            AND driver_id = $2::uuid
            AND COALESCE(ended_at, now()) > now() - interval '10 days'
          ORDER BY started_at ASC
        `,
        [query.data.operating_company_id, params.data.driver_id]
      );
      const summary8d = computeDailyDutySummary(summary8dEventsRes.rows, 8);
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
          ORDER BY started_at DESC, id DESC
        `,
        [query.data.operating_company_id, params.data.driver_id]
      );

      return {
        driver_id: params.data.driver_id,
        clocks,
        timeline_24h: events24hRes.rows,
        summary_8d: summary8d,
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
  app.get("/api/v1/dispatch/hos-clocks", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const query = batchQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const payload = await withCurrentUser(user.uuid, async (client) => {
      await setScopedCompanyContext(client, user.uuid, query.data.operating_company_id);
      await client.query(`SELECT set_config('app.user_role', $1::text, true)`, [user.role]);

      // Confine to drivers that actually belong to this operating company.
      const driverRes = await client.query<{ id: string }>(
        `
          SELECT d.id::text AS id
          FROM mdata.drivers d
          WHERE d.id = ANY($2::uuid[])
            AND d.archived_at IS NULL
            AND (
              d.operating_company_id = $1::uuid
              OR EXISTS (
                SELECT 1 FROM mdata.driver_company_authorizations dispatch_clock_dca
                WHERE dispatch_clock_dca.driver_id = d.id
                  AND dispatch_clock_dca.company_id = $1::uuid
                  AND dispatch_clock_dca.is_authorized = true
                  AND dispatch_clock_dca.deactivated_at IS NULL
              )
            )
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
  app.get("/api/v1/dispatch/load-positions", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const query = batchLoadQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const payload = await withCurrentUser(user.uuid, async (client) => {
      await setScopedCompanyContext(client, user.uuid, query.data.operating_company_id);
      await client.query(`SELECT set_config('app.user_role', $1::text, true)`, [user.role]);

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
