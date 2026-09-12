/**
 * TRUCK LINE — GET /api/v1/dispatch/truck-line (Lead assignment 2026-09-11, owner ruling).
 *
 * V10 (ROUND 18.6, owner-approved final spec): the row scope changed from "one row per in-service
 * unit" to "one row per ACTIVE LOAD, UNION one row per AVAILABLE DRIVER" — a deliberate narrowing
 * from an exhaustive fleet roster to "work in progress + workers ready for work" (the owner's own
 * framing: "a truck asking for a load"). A unit with no load and no qualifying available driver
 * is simply not drawn — this is the new board's intended scope, not an accidental omission.
 *
 * LOADED rows: one per active load (status IN dispatched/at_pickup/in_transit/at_delivery), unit-
 * anchored, station derived by station.ts's pure function — never a stored "station" column.
 *
 * AVAILABLE rows (kind:"available"): one per driver who qualifies — operating_company_id=USMCA,
 * status='Active', is_sample_data IS NOT TRUE, NOT currently assigned to any load in the same four
 * active statuses, AND with a samsara.hos_snapshots row polled within the last 2 hours. Unit/city
 * come from that driver's own MOST RECENT load (by created_at, any status) — may be null, in which
 * case the row honestly shows no unit rather than inventing one. samsara.hos_snapshots'
 * driving_hours_remaining/cycle_hours_remaining columns are misleadingly named — verified live
 * (schema + values, e.g. 660.00 for an 11-hour driver) that they actually store MINUTES; the API
 * exposes the raw minutes so the frontend formats "11h 00m" itself, never guessing a conversion
 * server-side and client-side that could drift apart.
 *
 * READ-ONLY. This file contains no UPDATE/INSERT to mdata.loads — every write the Truck Line UI
 * triggers goes through the EXISTING transition/stop-stamp/intransit-issue routes, called
 * separately by the frontend. Asserted statically by scripts/verify-dispatch-truck-line.mjs.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { currentAuthUser, withCompanyScope } from "../../accounting/shared.js";
import { openWorkOrderPredicateSql } from "../../maintenance/in-shop-condition.js";
import { deriveTruckLineStation, STATION_KEYS, STATION_LABELS, type StampSource } from "./station.js";

const querySchema = z.object({ operating_company_id: z.string().uuid() });

type Row = {
  unit_id: string;
  unit_number: string;
  load_id: string | null;
  load_number: string | null;
  raw_status: string | null;
  trip_type: string | null;
  rate_total_cents: number | null;
  customer_name: string | null;
  driver1_id: string | null;
  driver1_name: string | null;
  driver2_id: string | null;
  driver2_name: string | null;
  pickup_city: string | null;
  pickup_state: string | null;
  pickup_scheduled_at: string | null;
  pickup_appointment_start_at: string | null;
  pickup_arrival_at: string | null;
  pickup_arrival_source: StampSource;
  pickup_departure_at: string | null;
  pickup_departure_source: StampSource;
  delivery_city: string | null;
  delivery_state: string | null;
  delivery_scheduled_at: string | null;
  delivery_appointment_start_at: string | null;
  delivery_arrival_at: string | null;
  delivery_arrival_source: StampSource;
  delivery_departure_at: string | null;
  delivery_departure_source: StampSource;
  delivery_pod_count: number | null;
  invoice_display_id: string | null;
  issue_id: string | null;
  issue_category: string | null;
  issue_started_at: string | null;
  issue_reason_name: string | null;
  pos_lat: number | null;
  pos_lng: number | null;
  pos_speed_mph: number | null;
  pos_engine_state: string | null;
  pos_city: string | null;
  pos_state: string | null;
  pos_captured_at: string | null;
};

// V10 (ROUND 18.6) — one row per AVAILABLE driver (see file header). Unit/city are the driver's
// OWN most recent load's unit, entirely independent of the in-service unit roster above.
type AvailableRow = {
  driver_id: string;
  driver_first_name: string | null;
  driver_last_name: string | null;
  driving_minutes_remaining: number | null;
  cycle_minutes_remaining: number | null;
  hos_polled_at: string;
  unit_id: string | null;
  unit_number: string | null;
  last_closed_load_number: string | null;
  pos_city: string | null;
  pos_state: string | null;
  pos_captured_at: string | null;
};

// V7 (ROUND 18.5) — the owner's own LIVE POSITION RULE names 60 minutes as the staleness cutoff
// ("ping older than 60 min -> red 'signal stale'"); was 10 before this view had a rule of its own.
const LOC_STALE_MIN = 60;
// V10 (ROUND 18.6) — the owner's own "available" cutoff: an HOS snapshot older than 2 hours no
// longer counts as evidence the driver is genuinely ready to work right now.
const HOS_STALE_MIN = 120;

export async function registerTruckLineRoutes(app: FastifyInstance) {
  app.get("/api/v1/dispatch/truck-line", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const parsed = querySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    const { operating_company_id } = parsed.data;

    const payload = await withCompanyScope(user.uuid, operating_company_id, async (client) => {
      const reasonsTableRes = await client.query(
        `SELECT to_regclass('catalogs.load_exception_reasons') IS NOT NULL AS ok`
      );
      const reasonsTableExists = Boolean((reasonsTableRes.rows[0] as { ok?: boolean } | undefined)?.ok);

      const res = await client.query(
        `
        SELECT
          u.id::text AS unit_id, u.unit_number,
          l.id::text AS load_id, l.load_number, l.status::text AS raw_status, l.trip_type::text AS trip_type,
          l.rate_total_cents,
          COALESCE(cust.customer_name, mdata.resolve_customer_label_same_company(l.customer_id, l.operating_company_id)) AS customer_name,
          d1.id::text AS driver1_id, NULLIF(CONCAT_WS(' ', d1.first_name, d1.last_name), '') AS driver1_name,
          d2.id::text AS driver2_id, NULLIF(CONCAT_WS(' ', d2.first_name, d2.last_name), '') AS driver2_name,
          pu.city AS pickup_city, pu.state AS pickup_state, pu.scheduled_arrival_at::text AS pickup_scheduled_at,
          pu.appointment_start_at::text AS pickup_appointment_start_at,
          pu.actual_arrival_at::text AS pickup_arrival_at, pu.actual_arrival_source AS pickup_arrival_source,
          pu.actual_departure_at::text AS pickup_departure_at, pu.actual_departure_source AS pickup_departure_source,
          de.city AS delivery_city, de.state AS delivery_state, de.scheduled_arrival_at::text AS delivery_scheduled_at,
          de.appointment_start_at::text AS delivery_appointment_start_at,
          de.actual_arrival_at::text AS delivery_arrival_at, de.actual_arrival_source AS delivery_arrival_source,
          de.actual_departure_at::text AS delivery_departure_at, de.actual_departure_source AS delivery_departure_source,
          pod.cnt AS delivery_pod_count,
          inv.display_id AS invoice_display_id,
          issue.id::text AS issue_id, issue.issue_category, issue.reported_at::text AS issue_started_at,
          ${reasonsTableExists ? "reason.name" : "NULL"} AS issue_reason_name,
          p.lat::float8 AS pos_lat, p.lng::float8 AS pos_lng,
          p.speed_mph::float8 AS pos_speed_mph, p.engine_state AS pos_engine_state,
          COALESCE(p.city, loc.city) AS pos_city, COALESCE(p.state, loc.state) AS pos_state,
          p.captured_at::text AS pos_captured_at
        FROM mdata.units u
        LEFT JOIN LATERAL (
          SELECT * FROM mdata.loads x
          WHERE x.assigned_unit_id = u.id AND x.operating_company_id = $1::uuid AND x.soft_deleted_at IS NULL
            AND x.status NOT IN (
              'cancelled'::mdata.load_status_enum, 'abandoned'::mdata.load_status_enum,
              'driver_walkoff'::mdata.load_status_enum, 'driver_no_show'::mdata.load_status_enum,
              'invoiced'::mdata.load_status_enum, 'paid'::mdata.load_status_enum, 'closed'::mdata.load_status_enum
            )
          ORDER BY x.created_at DESC LIMIT 1
        ) l ON true
        LEFT JOIN mdata.customers cust ON cust.id = l.customer_id AND cust.operating_company_id = l.operating_company_id
        LEFT JOIN mdata.drivers d1 ON d1.id = l.assigned_primary_driver_id
        LEFT JOIN mdata.drivers d2 ON d2.id = l.assigned_secondary_driver_id
        LEFT JOIN LATERAL (
          SELECT * FROM mdata.load_stops s
          WHERE s.load_id = l.id AND s.stop_type = 'pickup'::mdata.stop_type_enum AND s.soft_deleted_at IS NULL
          ORDER BY s.sequence_number ASC LIMIT 1
        ) pu ON l.id IS NOT NULL
        LEFT JOIN LATERAL (
          SELECT * FROM mdata.load_stops s
          WHERE s.load_id = l.id AND s.stop_type = 'delivery'::mdata.stop_type_enum AND s.soft_deleted_at IS NULL
          ORDER BY s.sequence_number DESC LIMIT 1
        ) de ON l.id IS NOT NULL
        LEFT JOIN LATERAL (
          SELECT count(*)::int AS cnt FROM dispatch.pod_documents p2
          WHERE p2.stop_id = de.id AND p2.archived_at IS NULL
        ) pod ON de.id IS NOT NULL
        LEFT JOIN LATERAL (
          SELECT display_id FROM accounting.invoices iv
          WHERE iv.source_load_id = l.id AND iv.voided_at IS NULL AND iv.operating_company_id = $1::uuid
          ORDER BY iv.created_at DESC LIMIT 1
        ) inv ON l.id IS NOT NULL
        LEFT JOIN LATERAL (
          SELECT id, issue_category, reported_at FROM dispatch.intransit_issues ii
          WHERE ii.load_id = l.id AND ii.operating_company_id = $1::uuid AND ii.status IN ('open', 'acknowledged')
          ORDER BY ii.reported_at DESC LIMIT 1
        ) issue ON l.id IS NOT NULL
        ${reasonsTableExists
          ? `LEFT JOIN catalogs.load_exception_reasons reason ON reason.code = issue.issue_category AND reason.operating_company_id = $1::uuid AND reason.is_active = true`
          : ""}
        LEFT JOIN telematics.vehicle_latest_position p
          ON p.unit_id = u.id AND p.operating_company_id = COALESCE(u.currently_leased_to_company_id, u.owner_company_id)
        LEFT JOIN LATERAL (
          SELECT g.city, g.state FROM telematics.vehicle_locations g
          WHERE g.operating_company_id = COALESCE(u.currently_leased_to_company_id, u.owner_company_id)
            AND g.unit_id = u.id AND (g.city IS NOT NULL OR g.state IS NOT NULL)
          ORDER BY g.captured_at DESC LIMIT 1
        ) loc ON (p.city IS NULL AND p.state IS NULL)
        WHERE u.deactivated_at IS NULL
          -- Rule 49: USMCA in-service is the LEASE, never owner_company_id — same predicate as
          -- GET /api/v1/dispatch/units-without-load, so the two surfaces never disagree on scope.
          AND u.currently_leased_to_company_id = $1::uuid
          AND u.is_sample_data IS NOT TRUE
          AND u.sold_date IS NULL
          AND u.disposed_date IS NULL
          AND u.is_oos IS NOT TRUE
          AND u.status = 'InService'::mdata.unit_status
          AND NOT EXISTS (
            SELECT 1 FROM maintenance.work_orders wo
            WHERE wo.unit_id = u.id AND wo.operating_company_id = $1::uuid
              AND ${openWorkOrderPredicateSql("wo")}
          )
        ORDER BY u.unit_number ASC
        `,
        [operating_company_id]
      );

      // V10 (ROUND 18.6) — AVAILABLE drivers: an entirely separate query, driver-anchored, never
      // cross-referenced against the in-service unit roster above (a driver may have no unit).
      const availableRes = await client.query(
        `
        WITH busy_drivers AS (
          SELECT DISTINCT assigned_primary_driver_id AS driver_id FROM mdata.loads
          WHERE operating_company_id = $1::uuid
            AND status IN ('dispatched', 'at_pickup', 'in_transit', 'at_delivery')
            AND assigned_primary_driver_id IS NOT NULL
          UNION
          SELECT DISTINCT assigned_secondary_driver_id FROM mdata.loads
          WHERE operating_company_id = $1::uuid
            AND status IN ('dispatched', 'at_pickup', 'in_transit', 'at_delivery')
            AND assigned_secondary_driver_id IS NOT NULL
        ),
        latest_hos AS (
          SELECT DISTINCT ON (driver_uuid) driver_uuid, driving_hours_remaining, cycle_hours_remaining, polled_at
          FROM samsara.hos_snapshots
          WHERE operating_company_id = $1::uuid
          ORDER BY driver_uuid, polled_at DESC
        ),
        qualifying AS (
          SELECT d.id AS driver_id, d.first_name, d.last_name,
                 h.driving_hours_remaining, h.cycle_hours_remaining, h.polled_at
          FROM mdata.drivers d
          JOIN latest_hos h ON h.driver_uuid = d.id
          WHERE d.operating_company_id = $1::uuid
            AND d.status = 'Active'
            AND d.is_sample_data IS NOT TRUE
            AND d.id NOT IN (SELECT driver_id FROM busy_drivers)
            AND h.polled_at > now() - interval '${HOS_STALE_MIN} minutes'
        )
        SELECT
          q.driver_id, q.first_name AS driver_first_name, q.last_name AS driver_last_name,
          q.driving_hours_remaining::float8 AS driving_minutes_remaining,
          q.cycle_hours_remaining::float8 AS cycle_minutes_remaining,
          q.polled_at::text AS hos_polled_at,
          recent.unit_id, recent_u.unit_number,
          lastclosed.load_number AS last_closed_load_number,
          p.city AS pos_city, p.state AS pos_state, p.captured_at::text AS pos_captured_at
        FROM qualifying q
        LEFT JOIN LATERAL (
          SELECT assigned_unit_id AS unit_id FROM mdata.loads l
          WHERE (l.assigned_primary_driver_id = q.driver_id OR l.assigned_secondary_driver_id = q.driver_id)
            AND l.operating_company_id = $1::uuid
          ORDER BY l.created_at DESC LIMIT 1
        ) recent ON true
        LEFT JOIN mdata.units recent_u ON recent_u.id = recent.unit_id
        LEFT JOIN LATERAL (
          SELECT load_number FROM mdata.loads l2
          WHERE (l2.assigned_primary_driver_id = q.driver_id OR l2.assigned_secondary_driver_id = q.driver_id)
            AND l2.operating_company_id = $1::uuid
            AND l2.status IN ('delivered', 'delivered_pending_docs', 'completed_docs_received', 'invoiced', 'paid', 'closed')
          ORDER BY l2.updated_at DESC LIMIT 1
        ) lastclosed ON true
        LEFT JOIN telematics.vehicle_latest_position p
          ON p.unit_id = recent.unit_id AND p.operating_company_id = $1::uuid
        ORDER BY q.first_name, q.last_name
        `,
        [operating_company_id]
      );

      return { rows: res.rows as Row[], availableRows: availableRes.rows as AvailableRow[], reasonsTableExists };
    });

    const now = Date.now();
    // V10 (ROUND 18.6) — a unit with no active load is no longer drawn on its own (the row scope
    // narrowed to "active loads UNION available drivers" — see file header). Filter here rather
    // than in SQL so the query above stays reusable/identical to the pre-V10 shape for the parts
    // that did not change.
    const loadedRows = payload.rows.filter((r) => r.load_id != null);
    const rows = loadedRows.map((r) => {
      const station = r.load_id
        ? deriveTruckLineStation({
            rawStatus: r.raw_status ?? "unassigned",
            // mdata.loads has no dispatched_at column (verified live schema) — no honest source for
            // this specific stamp exists yet; the station still derives correctly from raw status,
            // it just renders no hover-timestamp for the Dispatched node (never a guessed one).
            dispatchedAt: null,
            pickupArrivalAt: r.pickup_arrival_at,
            pickupArrivalSource: r.pickup_arrival_source,
            pickupDepartureAt: r.pickup_departure_at,
            pickupDepartureSource: r.pickup_departure_source,
            deliveryArrivalAt: r.delivery_arrival_at,
            deliveryArrivalSource: r.delivery_arrival_source,
            deliveryDepartureAt: r.delivery_departure_at,
            deliveryDepartureSource: r.delivery_departure_source,
            hasDeliveryPod: (r.delivery_pod_count ?? 0) > 0,
            hasInvoice: r.invoice_display_id != null,
            invoiceDisplayId: r.invoice_display_id,
            openException: r.issue_id
              ? { reasonLabel: r.issue_reason_name ?? r.issue_category ?? "Other", startedAt: r.issue_started_at ?? "" }
              : null,
          })
        : null;

      // V7 (ROUND 18.5): "use appointment_start_at when present, else scheduled_arrival_at, and
      // say which in the cell's title attribute" — appointment_start_at is NULL on every measured
      // USMCA stop today (a real, documented data gap), so this currently always falls back to
      // scheduled_arrival_at, but never silently prefers the wrong one once appointment_start_at
      // is populated.
      let nextAppointment:
        | { type: "pickup" | "delivery"; at: string | null; at_source: "appointment_start_at" | "scheduled_arrival_at" | null; late: boolean }
        | null = null;
      if (r.load_id) {
        if (!r.pickup_arrival_at) {
          const at = r.pickup_appointment_start_at ?? r.pickup_scheduled_at;
          nextAppointment = {
            type: "pickup",
            at,
            at_source: r.pickup_appointment_start_at ? "appointment_start_at" : r.pickup_scheduled_at ? "scheduled_arrival_at" : null,
            late: at != null && new Date(at).getTime() < now,
          };
        } else if (!r.delivery_arrival_at) {
          const at = r.delivery_appointment_start_at ?? r.delivery_scheduled_at;
          nextAppointment = {
            type: "delivery",
            at,
            at_source: r.delivery_appointment_start_at ? "appointment_start_at" : r.delivery_scheduled_at ? "scheduled_arrival_at" : null,
            late: at != null && new Date(at).getTime() < now,
          };
        }
      }

      const capMs = r.pos_captured_at ? new Date(r.pos_captured_at).getTime() : NaN;
      const staleMinutes = Number.isNaN(capMs) ? null : Math.floor((now - capMs) / 60000);

      return {
        kind: "loaded" as const,
        unit_id: r.unit_id,
        unit_number: r.unit_number,
        load: r.load_id
          ? {
              load_id: r.load_id,
              load_number: r.load_number,
              trip_type: r.trip_type,
              rate_total_cents: r.rate_total_cents,
              customer_name: r.customer_name,
              pickup: { city: r.pickup_city, state: r.pickup_state },
              delivery: { city: r.delivery_city, state: r.delivery_state },
            }
          : null,
        drivers: [
          r.driver1_id ? { id: r.driver1_id, name: r.driver1_name } : null,
          r.driver2_id ? { id: r.driver2_id, name: r.driver2_name } : null,
        ].filter((d): d is { id: string; name: string | null } => d != null),
        station: station
          ? {
              reached_index: station.reachedIndex,
              next_index: station.nextIndex,
              stamps: station.stamps,
              has_open_exception: station.hasOpenException,
              exception_reason_label: station.exceptionReasonLabel,
              // V8 (ROUND 18.5 addendum): the "Other" status station's clear action resolves this
              // EXACT open dispatch.intransit_issues row (POST .../intransit-issues/:id/resolve) —
              // the frontend cannot resolve what it cannot name.
              open_exception_id: r.issue_id,
            }
          : null,
        position: r.pos_captured_at
          ? {
              lat: r.pos_lat,
              lng: r.pos_lng,
              // V7 LIVE POSITION RULE inputs — speed/engine decide "moving" vs "parked", never
              // fabricated; NULL when Samsara hasn't reported either on this ping.
              speed_mph: r.pos_speed_mph,
              engine_state: r.pos_engine_state,
              city: r.pos_city,
              state: r.pos_state,
              captured_at: r.pos_captured_at,
              stale_minutes: staleMinutes,
              stale: staleMinutes != null && staleMinutes > LOC_STALE_MIN,
            }
          : null,
        next_appointment: nextAppointment,
      };
    });

    // V10 (ROUND 18.6) — one row per available driver. driving/cycle minutes are exposed RAW
    // (never pre-formatted here) so the frontend's own "11h 00m" rendering can never silently
    // drift from a server-side copy of the same conversion.
    const availableRows = payload.availableRows.map((r) => {
      const polledMs = new Date(r.hos_polled_at).getTime();
      const hosPolledMinutesAgo = Number.isNaN(polledMs) ? null : Math.max(0, Math.floor((now - polledMs) / 60000));
      return {
        kind: "available" as const,
        unit_id: r.unit_id,
        unit_number: r.unit_number,
        load: null,
        drivers: [{ id: r.driver_id, name: [r.driver_first_name, r.driver_last_name].filter(Boolean).join(" ") || null }],
        station: null,
        position: null,
        next_appointment: null,
        available: {
          driver_id: r.driver_id,
          driving_minutes_remaining: r.driving_minutes_remaining,
          cycle_minutes_remaining: r.cycle_minutes_remaining,
          hos_polled_minutes_ago: hosPolledMinutesAgo,
          last_closed_load_number: r.last_closed_load_number,
          parked_city: r.pos_city,
          parked_state: r.pos_state,
        },
      };
    });

    const allRows = [...rows, ...availableRows];

    return reply.code(200).send({
      rows: allRows,
      total_count: allRows.length,
      loaded_count: rows.length,
      available_count: availableRows.length,
      stations: STATION_KEYS.map((key, i) => ({ key, index: i, label: STATION_LABELS[key] })),
      catalog_ready: payload.reasonsTableExists,
    });
  });
}
