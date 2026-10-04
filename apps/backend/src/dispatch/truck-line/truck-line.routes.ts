/**
 * TRUCK LINE — GET /api/v1/dispatch/truck-line (Lead assignment 2026-09-11, owner ruling).
 *
 * ROUND 255: LOADED legs = the ONE canonical active-load set
 * (`canonicalActiveLoadWhereClause` via CURRENT_TRUCK_LINE_LOAD_SQL alias). AUTH-061 48h hide
 * is retired — board row count must equal the canonical active-load count. Multiple legs on
 * one unit (including a RETURN TRIP whose PU date equals the prior DEL date) stack as TWO
 * rows under that unit; do not de-duplicate.
 *
 * AVAILABLE rows: driver with fresh HOS, not on a canonical-active load, with a real unit.
 *
 * READ-ONLY. No UPDATE/INSERT to mdata.loads here.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { currentAuthUser, withCompanyScope } from "../../accounting/shared.js";
import { openWorkOrderPredicateSql } from "../../maintenance/in-shop-condition.js";
import { CURRENT_TRUCK_LINE_LOAD_SQL } from "../current-truck-line-load.js";
import { assertCanonicalSubset, DISPATCH_WORK_LOAD_STATUSES } from "../canonical-active-load-set.js";
import { groupTruckLineByUnit } from "./group-by-unit.js";
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
  tour_id: string | null;
  tour_display_id: string | null;
  created_at: string | null;
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
  pos_formatted_location: string | null;
  pos_captured_at: string | null;
};

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

type PendingRow = {
  load_id: string;
  load_number: string;
  raw_status: string;
  trip_type: string | null;
  created_at: string;
  customer_name: string | null;
  pickup_city: string | null;
  pickup_state: string | null;
  pickup_scheduled_at: string | null;
  delivery_city: string | null;
  delivery_state: string | null;
  unit_id: string | null;
  unit_number: string | null;
};

// T-04 (Lead order, 2026-09-30): "undispatched loads live in a lower section and PROMOTE to the
// top section the moment they are dispatched" — this is the FEED half; the section UI is a
// separate build. DISPATCH_WORK_LOAD_STATUSES is the canonical dispatch-work set (booked through
// at_delivery); the pending/bottom set is that set MINUS the four "actively rolling" statuses the
// main `rows` query already covers, so the two lists can never overlap for the SAME reason (a
// load promotes the instant its status crosses into ACTIVE_DISPATCH_STATUSES -- no separate
// "promote" write path to build or keep in sync).
export const ACTIVE_DISPATCH_STATUSES = ["dispatched", "at_pickup", "in_transit", "at_delivery"] as const;
assertCanonicalSubset("ACTIVE_DISPATCH_STATUSES", ACTIVE_DISPATCH_STATUSES);
export const PENDING_LOAD_STATUSES = DISPATCH_WORK_LOAD_STATUSES.filter(
  (s) => !(ACTIVE_DISPATCH_STATUSES as readonly string[]).includes(s)
);

const LOC_STALE_MIN = 60;
const HOS_STALE_MIN = 120;

// Exported (ROUND 177 JOB 1) so verify-load-boards-agree.mjs can reuse this SAME fragment rather
// than re-deriving its own "is this unit in service" copy that could drift from the real one.
export const UNIT_IN_SERVICE_SQL = `
  u.deactivated_at IS NULL
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
`;

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
      // Read path: the board still renders without the reasons catalog, but SAYS so (catalog_status in the response).
      const reasonsCatalogStatus: "ready" | "unavailable" = reasonsTableExists ? "ready" : "unavailable";

      // One row per CURRENT load (not LIMIT 1 per unit) so tour legs can stack under one truck.
      const res = await client.query(
        `
        SELECT
          u.id::text AS unit_id, u.unit_number,
          l.id::text AS load_id, l.load_number, l.status::text AS raw_status, l.trip_type::text AS trip_type,
          l.rate_total_cents, l.created_at::text AS created_at,
          l.tour_id::text AS tour_id,
          CASE
            WHEN sett.display_id ~ '^P-[0-9]+$' THEN sett.display_id
            ELSE NULL
          END AS tour_display_id,
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
          COALESCE(p.formatted_location, loc.formatted_location) AS pos_formatted_location,
          p.captured_at::text AS pos_captured_at
        FROM mdata.loads l
        JOIN mdata.units u ON u.id = l.assigned_unit_id
        LEFT JOIN driver_finance.driver_settlements sett
          ON sett.id = l.presettlement_link_id
         AND sett.operating_company_id = $1::uuid
        LEFT JOIN mdata.customers cust ON cust.id = l.customer_id AND cust.operating_company_id = l.operating_company_id
        LEFT JOIN mdata.drivers d1 ON d1.id = l.assigned_primary_driver_id
        LEFT JOIN mdata.drivers d2 ON d2.id = l.assigned_secondary_driver_id
        LEFT JOIN LATERAL (
          SELECT * FROM mdata.load_stops s
          WHERE s.load_id = l.id AND s.stop_type = 'pickup'::mdata.stop_type_enum AND s.soft_deleted_at IS NULL
          ORDER BY s.sequence_number ASC LIMIT 1
        ) pu ON true
        LEFT JOIN LATERAL (
          SELECT * FROM mdata.load_stops s
          WHERE s.load_id = l.id AND s.stop_type = 'delivery'::mdata.stop_type_enum AND s.soft_deleted_at IS NULL
          ORDER BY s.sequence_number DESC LIMIT 1
        ) de ON true
        LEFT JOIN LATERAL (
          SELECT count(*)::int AS cnt FROM dispatch.pod_documents p2
          WHERE p2.stop_id = de.id AND p2.archived_at IS NULL
        ) pod ON de.id IS NOT NULL
        LEFT JOIN LATERAL (
          SELECT display_id FROM accounting.invoices iv
          WHERE iv.source_load_id = l.id AND iv.voided_at IS NULL AND iv.operating_company_id = $1::uuid
          ORDER BY iv.created_at DESC LIMIT 1
        ) inv ON true
        LEFT JOIN LATERAL (
          SELECT id, issue_category, reported_at FROM dispatch.intransit_issues ii
          WHERE ii.load_id = l.id AND ii.operating_company_id = $1::uuid AND ii.status IN ('open', 'acknowledged')
          ORDER BY ii.reported_at DESC LIMIT 1
        ) issue ON true
        ${reasonsTableExists
          ? `LEFT JOIN catalogs.load_exception_reasons reason ON reason.code = issue.issue_category AND reason.operating_company_id = $1::uuid AND reason.is_active = true`
          : ""}
        LEFT JOIN telematics.vehicle_latest_position p
          ON p.unit_id = u.id AND p.operating_company_id = COALESCE(u.currently_leased_to_company_id, u.owner_company_id)
        LEFT JOIN LATERAL (
          SELECT g.city, g.state, g.formatted_location FROM telematics.vehicle_locations g
          WHERE g.operating_company_id = COALESCE(u.currently_leased_to_company_id, u.owner_company_id)
            AND g.unit_id = u.id AND (g.city IS NOT NULL OR g.state IS NOT NULL)
          ORDER BY g.captured_at DESC LIMIT 1
        ) loc ON (p.city IS NULL AND p.state IS NULL)
        WHERE l.operating_company_id = $1::uuid
          AND l.soft_deleted_at IS NULL
          AND l.assigned_unit_id IS NOT NULL
          AND ${CURRENT_TRUCK_LINE_LOAD_SQL.replace(/\bx\./g, "l.")}
          AND ${UNIT_IN_SERVICE_SQL}
        ORDER BY u.unit_number ASC, l.created_at ASC
        `,
        [operating_company_id]
      );

      const availableRes = await client.query(
        `
        WITH busy_drivers AS (
          SELECT DISTINCT assigned_primary_driver_id AS driver_id FROM mdata.loads x
          WHERE x.operating_company_id = $1::uuid
            AND x.soft_deleted_at IS NULL
            AND ${CURRENT_TRUCK_LINE_LOAD_SQL}
            AND x.assigned_primary_driver_id IS NOT NULL
          UNION
          SELECT DISTINCT assigned_secondary_driver_id FROM mdata.loads x
          WHERE x.operating_company_id = $1::uuid
            AND x.soft_deleted_at IS NULL
            AND ${CURRENT_TRUCK_LINE_LOAD_SQL}
            AND x.assigned_secondary_driver_id IS NOT NULL
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

      // T-04: the bottom-section feed. LEFT JOIN units (a booked load may not have one yet) and
      // exclude any load that already qualifies for the top `rows` query (a pre-assigned,
      // in-service unit) -- the NOT EXISTS below is UNIT_IN_SERVICE_SQL's own predicate, aliased,
      // so the two lists can never disagree about which side a load is on.
      const pendingRes = await client.query(
        `
        SELECT
          l.id::text AS load_id, l.load_number, l.status::text AS raw_status, l.trip_type::text AS trip_type,
          l.created_at::text AS created_at,
          COALESCE(cust.customer_name, mdata.resolve_customer_label_same_company(l.customer_id, l.operating_company_id)) AS customer_name,
          pu.city AS pickup_city, pu.state AS pickup_state, pu.scheduled_arrival_at::text AS pickup_scheduled_at,
          de.city AS delivery_city, de.state AS delivery_state,
          u.id::text AS unit_id, u.unit_number
        FROM mdata.loads l
        LEFT JOIN mdata.customers cust ON cust.id = l.customer_id AND cust.operating_company_id = l.operating_company_id
        LEFT JOIN mdata.units u ON u.id = l.assigned_unit_id
        LEFT JOIN LATERAL (
          SELECT * FROM mdata.load_stops s
          WHERE s.load_id = l.id AND s.stop_type = 'pickup'::mdata.stop_type_enum AND s.soft_deleted_at IS NULL
          ORDER BY s.sequence_number ASC LIMIT 1
        ) pu ON true
        LEFT JOIN LATERAL (
          SELECT * FROM mdata.load_stops s
          WHERE s.load_id = l.id AND s.stop_type = 'delivery'::mdata.stop_type_enum AND s.soft_deleted_at IS NULL
          ORDER BY s.sequence_number DESC LIMIT 1
        ) de ON true
        WHERE l.operating_company_id = $1::uuid
          AND l.soft_deleted_at IS NULL
          AND l.status::text IN (${PENDING_LOAD_STATUSES.map((_, i) => `$${i + 2}`).join(", ")})
          AND NOT EXISTS (
            SELECT 1 FROM mdata.units u2
            WHERE u2.id = l.assigned_unit_id
              AND ${UNIT_IN_SERVICE_SQL.replace(/\bu\./g, "u2.")}
          )
        ORDER BY l.created_at ASC
        `,
        [operating_company_id, ...PENDING_LOAD_STATUSES]
      );

      return {
        rows: res.rows as Row[],
        availableRows: availableRes.rows as AvailableRow[],
        pendingRows: pendingRes.rows as PendingRow[],
        reasonsTableExists,
        reasonsCatalogStatus,
      };
    });

    const now = Date.now();

    const buildLoadedRow = (r: Row) => {
      const station = r.load_id
        ? deriveTruckLineStation({
            rawStatus: r.raw_status ?? "unassigned",
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

      type AppointmentLeg = { at: string; at_source: "appointment_start_at" | "scheduled_arrival_at" | null; late: boolean } | null;
      let appointments: { pickup: AppointmentLeg; delivery: AppointmentLeg } | null = null;
      if (r.load_id) {
        const pickupAt = r.pickup_appointment_start_at ?? r.pickup_scheduled_at;
        const deliveryAt = r.delivery_appointment_start_at ?? r.delivery_scheduled_at;
        appointments = {
          pickup: pickupAt != null
            ? {
                at: pickupAt,
                at_source: r.pickup_appointment_start_at ? "appointment_start_at" : "scheduled_arrival_at",
                late: new Date(pickupAt).getTime() < now,
              }
            : null,
          delivery: deliveryAt != null
            ? {
                at: deliveryAt,
                at_source: r.delivery_appointment_start_at ? "appointment_start_at" : "scheduled_arrival_at",
                late: new Date(deliveryAt).getTime() < now,
              }
            : null,
        };
      }

      const capMs = r.pos_captured_at ? new Date(r.pos_captured_at).getTime() : NaN;
      const staleMinutes = Number.isNaN(capMs) ? null : Math.floor((now - capMs) / 60000);

      return {
        kind: "loaded" as const,
        unit_id: r.unit_id,
        unit_number: r.unit_number,
        tour_display_id: r.tour_display_id,
        load: r.load_id
          ? {
              load_id: r.load_id,
              load_number: r.load_number,
              status: r.raw_status,
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
              open_exception_id: r.issue_id,
            }
          : null,
        position: r.pos_captured_at
          ? {
              lat: r.pos_lat,
              lng: r.pos_lng,
              speed_mph: r.pos_speed_mph,
              engine_state: r.pos_engine_state,
              city: r.pos_city,
              state: r.pos_state,
              formatted_location: r.pos_formatted_location,
              captured_at: r.pos_captured_at,
              stale_minutes: staleMinutes,
              stale: staleMinutes != null && staleMinutes > LOC_STALE_MIN,
            }
          : null,
        next_appointment: nextAppointment,
        appointments,
      };
    };

    const loadedLegs = payload.rows
      .filter((r) => r.load_id != null)
      .map((r) => {
        const row = buildLoadedRow(r);
        return {
          unit_id: r.unit_id,
          unit_number: r.unit_number,
          load_id: r.load_id,
          trip_type: r.trip_type,
          tour_id: r.tour_id,
          tour_display_id: r.tour_display_id,
          created_at: r.created_at,
          row,
        };
      });

    const availableBuilt = payload.availableRows
      .filter((r) => r.unit_id != null && r.unit_number != null)
      .map((r) => {
        const polledMs = new Date(r.hos_polled_at).getTime();
        const hosPolledMinutesAgo = Number.isNaN(polledMs) ? null : Math.max(0, Math.floor((now - polledMs) / 60000));
        const row = {
          kind: "available" as const,
          unit_id: r.unit_id,
          unit_number: r.unit_number,
          tour_display_id: null as string | null,
          load: null,
          drivers: [{ id: r.driver_id, name: [r.driver_first_name, r.driver_last_name].filter(Boolean).join(" ") || null }],
          station: null,
          position: null,
          next_appointment: null,
          appointments: null,
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
        return { unit_id: r.unit_id as string, unit_number: r.unit_number as string, row };
      });

    type LoadedBuilt = ReturnType<typeof buildLoadedRow>;
    type AvailableBuilt = (typeof availableBuilt)[number]["row"];
    const groups = groupTruckLineByUnit<LoadedBuilt | AvailableBuilt>(loadedLegs, availableBuilt as Array<{
      unit_id: string;
      unit_number: string;
      row: AvailableBuilt;
    }>);
    const flatRows = groups.flatMap((g) => g.legs);
    const loadedCount = groups.filter((g) => g.section !== "available").reduce((n, g) => n + g.legs.length, 0);
    const availableCount = groups.filter((g) => g.section === "available").length;

    // T-04: bottom-section feed -- booked/planned/assigned loads not yet actively rolling. Never
    // unit-grouped (a booked load may carry no unit at all), so it ships as its own flat list
    // beside `groups` rather than forced into groupTruckLineByUnit's per-unit shape.
    const pendingRows = payload.pendingRows.map((r) => ({
      load_id: r.load_id,
      load_number: r.load_number,
      status: r.raw_status,
      trip_type: r.trip_type,
      created_at: r.created_at,
      customer_name: r.customer_name,
      pickup_city: r.pickup_city,
      pickup_state: r.pickup_state,
      pickup_scheduled_at: r.pickup_scheduled_at,
      delivery_city: r.delivery_city,
      delivery_state: r.delivery_state,
      unit_id: r.unit_id,
      unit_number: r.unit_number,
    }));

    return reply.code(200).send({
      groups,
      rows: flatRows,
      pending_rows: pendingRows,
      total_count: groups.length,
      loaded_count: loadedCount,
      available_count: availableCount,
      pending_count: pendingRows.length,
      tour_count: groups.filter((g) => g.section === "tour").length,
      in_transit_count: groups.filter((g) => g.section === "in_transit").length,
      stations: STATION_KEYS.map((key, i) => ({ key, index: i, label: STATION_LABELS[key] })),
      catalog_ready: payload.reasonsTableExists,
      catalog_status: payload.reasonsCatalogStatus,
    });
  });
}
