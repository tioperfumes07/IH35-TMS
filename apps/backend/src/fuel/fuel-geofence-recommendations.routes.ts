/**
 * B-25 — READ-ONLY fuel geofence recommendation surface (Lead order, docs/bus/NOW-CC-2.md ROUND
 * 294). ZERO writes below — no INSERT, no UPDATE, no DELETE. Given a unit + a calendar date, this
 * returns every fuel-stop geofence window the unit was inside that day (evidence: paired
 * geo.geofence_events 'entered'/'exited' rows), scored by fuel-geofence-recommendation.engine.ts
 * (a pure function — see that file's header for the confidence rule). The human reads these
 * proposals and then fills the EXISTING manual entry form
 * (POST /api/v1/fuel/transactions, fuel-transactions.routes.ts) by hand — this route never calls
 * that write path and never persists a "recommendation" row; there is nothing to accept/reject
 * because nothing here is stored state to begin with.
 *
 * Load attribution: derived from mdata.loads/mdata.load_stops by time-window overlap against the
 * unit's own assignment — NOT from geo.geofence_state_transitions.load_id, which measured 0 of
 * 7,610 populated live on 2026-09-30 (see the engine file's header for the same note).
 *
 * Odometer: offered via the same nearest-time join CC-3's T-21
 * real-driven-miles.service.ts already uses against telematics.vehicle_locations.odometer_mi
 * (±10 minutes). That column has read NULL for every unit since 2026-09-10 (the Samsara odometer
 * blackout, see the 2026-09-30 LEAD RETRACTION in NOW-CC-2.md) — when absent, the engine states
 * "no odometer reading" rather than silently omitting the field or interpolating.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { canVoidCancel } from "../lib/authz/void-cancel-authz.js";
import {
  rankFuelGeofenceRecommendations,
  type FuelGeofenceWindowInput,
  type FuelGeofenceRecommendation,
} from "./fuel-geofence-recommendation.engine.js";

const querySchema = z.object({
  operating_company_id: z.string().uuid(),
  unit_id: z.string().uuid(),
  date: z.string().date(),
});

type FuelStopEventRow = {
  id: string;
  geofence_id: string;
  geofence_label: string;
  event_kind: "entered" | "exited";
  occurred_at: string;
};

export type FuelGeofenceRecommendationsResponse = {
  unit_id: string;
  date: string;
  recommendations: FuelGeofenceRecommendation[];
  candidate_window_count: number;
};

export async function registerFuelGeofenceRecommendationsRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/fuel/geofence-recommendations",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = requireAuth(req, reply) ? req.user : null;
      if (!user) return;
      if (!canVoidCancel(String(user.role ?? ""))) {
        return reply.code(403).send({ error: "forbidden", detail: "fuel geofence recommendations require an accounting role" });
      }

      const q = querySchema.safeParse(req.query ?? {});
      if (!q.success) return reply.code(400).send({ error: "validation_error", details: q.error.flatten() });

      await assertCompanyMembership(user.uuid, q.data.operating_company_id);

      const payload: FuelGeofenceRecommendationsResponse = await withCurrentUser(user.uuid, async (client) => {
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [q.data.operating_company_id]);

        // All 'entered'/'exited' geo.geofence_events for this unit's calendar day, at a
        // location_kind='fuel_stop' geofence. voided/soft-delete does not exist on this table —
        // it is append-only telemetry, matching CC-3's real-driven-miles.service.ts query shape.
        const eventsRes = await client.query<FuelStopEventRow>(
          `
          SELECT ge.id::text, ge.geofence_id::text, gf.label AS geofence_label,
                 ge.event_kind, ge.occurred_at::text
          FROM geo.geofence_events ge
          JOIN geo.geofences gf ON gf.id = ge.geofence_id
          WHERE ge.operating_company_id = $1::uuid
            AND ge.unit_id = $2::uuid
            AND gf.location_kind = 'fuel_stop'
            AND ge.occurred_at >= $3::date
            AND ge.occurred_at < ($3::date + interval '1 day')
          ORDER BY ge.occurred_at ASC
          `,
          [q.data.operating_company_id, q.data.unit_id, q.data.date]
        );

        // Pair each 'entered' with the nearest following 'exited' at the SAME geofence, never
        // reusing an 'exited' row across two windows.
        const usedExitIds = new Set<string>();
        const windows: { geofenceId: string; geofenceLabel: string; enteredAt: string; exitedAt: string | null }[] = [];
        for (const ev of eventsRes.rows) {
          if (ev.event_kind !== "entered") continue;
          const exit = eventsRes.rows.find(
            (x) =>
              x.event_kind === "exited" &&
              x.geofence_id === ev.geofence_id &&
              !usedExitIds.has(x.id) &&
              new Date(x.occurred_at).getTime() >= new Date(ev.occurred_at).getTime()
          );
          if (exit) usedExitIds.add(exit.id);
          windows.push({
            geofenceId: ev.geofence_id,
            geofenceLabel: ev.geofence_label,
            enteredAt: ev.occurred_at,
            exitedAt: exit?.occurred_at ?? null,
          });
        }

        if (windows.length === 0) {
          return { unit_id: q.data.unit_id, date: q.data.date, recommendations: [], candidate_window_count: 0 };
        }

        // Odometer: nearest telematics.vehicle_locations reading within ±10 minutes of entered_at
        // for this unit — identical window to CC-3's T-21 real-driven-miles.service.ts join.
        // Load attribution: the load this unit was assigned to whose pickup/delivery window
        // covers entered_at, derived from mdata.loads + its own stops (never from
        // geo.geofence_state_transitions.load_id — 0/7,610 populated live).
        const enrichedRes = await client.query<{
          entered_at: string;
          odometer_reading_mi: string | number | null;
          odometer_captured_at: string | null;
          load_id: string | null;
          load_number: string | null;
        }>(
          `
          SELECT w.entered_at::text,
                 odo.odometer_mi AS odometer_reading_mi,
                 odo.captured_at::text AS odometer_captured_at,
                 ld.id::text AS load_id,
                 ld.load_number
          FROM unnest($3::timestamptz[]) AS w(entered_at)
          LEFT JOIN LATERAL (
            SELECT vl.odometer_mi, vl.captured_at
            FROM telematics.vehicle_locations vl
            WHERE vl.operating_company_id = $1::uuid AND vl.unit_id = $2::uuid
              AND vl.odometer_mi IS NOT NULL
              AND vl.captured_at BETWEEN w.entered_at - interval '10 minutes' AND w.entered_at + interval '10 minutes'
            ORDER BY abs(extract(epoch FROM (vl.captured_at - w.entered_at))), vl.captured_at DESC
            LIMIT 1
          ) odo ON true
          LEFT JOIN LATERAL (
            SELECT l.id, l.load_number
            FROM mdata.loads l
            JOIN LATERAL (
              SELECT COALESCE(p.actual_arrival_at, p.scheduled_arrival_at) AS pickup_at
              FROM mdata.load_stops p
              WHERE p.load_id = l.id AND p.stop_type::text = 'pickup' AND p.soft_deleted_at IS NULL
              ORDER BY p.sequence_number ASC LIMIT 1
            ) pu ON true
            LEFT JOIN LATERAL (
              SELECT COALESCE(d.actual_departure_at, d.actual_arrival_at, d.scheduled_arrival_at) AS delivery_at
              FROM mdata.load_stops d
              WHERE d.load_id = l.id AND d.stop_type::text = 'delivery' AND d.soft_deleted_at IS NULL
              ORDER BY d.sequence_number DESC LIMIT 1
            ) dl ON true
            WHERE l.operating_company_id = $1::uuid AND l.assigned_unit_id = $2::uuid AND l.soft_deleted_at IS NULL
              AND pu.pickup_at IS NOT NULL
              AND w.entered_at >= pu.pickup_at - interval '24 hours'
              AND (dl.delivery_at IS NULL OR w.entered_at <= dl.delivery_at + interval '24 hours')
            ORDER BY abs(extract(epoch FROM (w.entered_at - pu.pickup_at))) ASC
            LIMIT 1
          ) ld ON true
          `,
          [q.data.operating_company_id, q.data.unit_id, windows.map((w) => w.enteredAt)]
        );
        const enrichedByEnteredAt = new Map(enrichedRes.rows.map((r) => [r.entered_at, r]));

        const engineInput: FuelGeofenceWindowInput[] = windows.map((w) => {
          const enrich = enrichedByEnteredAt.get(w.enteredAt);
          return {
            geofence_id: w.geofenceId,
            geofence_label: w.geofenceLabel,
            entered_at: w.enteredAt,
            exited_at: w.exitedAt,
            load_id: enrich?.load_id ?? null,
            load_number: enrich?.load_number ?? null,
            odometer_reading_mi: enrich?.odometer_reading_mi != null ? Number(enrich.odometer_reading_mi) : null,
            odometer_captured_at: enrich?.odometer_captured_at ?? null,
          };
        });

        return {
          unit_id: q.data.unit_id,
          date: q.data.date,
          recommendations: rankFuelGeofenceRecommendations(engineInput),
          candidate_window_count: windows.length,
        };
      });

      return payload;
    }
  );
}
