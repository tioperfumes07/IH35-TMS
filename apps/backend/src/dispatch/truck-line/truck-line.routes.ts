/**
 * TRUCK LINE — GET /api/v1/dispatch/truck-line (Lead assignment 2026-09-11, owner ruling).
 *
 * One row per in-service USMCA truck (the SAME unit predicate as GET /api/v1/dispatch/units-
 * without-load in loads.routes.ts, so this view and the Awaiting-truck roster can never
 * disagree on which units are "in service"), each carrying its current non-terminal load (if
 * any) and the station derived by station.ts's pure function — never a stored "station" column.
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
  pickup_arrival_at: string | null;
  pickup_arrival_source: StampSource;
  pickup_departure_at: string | null;
  pickup_departure_source: StampSource;
  delivery_city: string | null;
  delivery_state: string | null;
  delivery_scheduled_at: string | null;
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
  pos_city: string | null;
  pos_state: string | null;
  pos_captured_at: string | null;
};

const LOC_STALE_MIN = 10;

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
          pu.actual_arrival_at::text AS pickup_arrival_at, pu.actual_arrival_source AS pickup_arrival_source,
          pu.actual_departure_at::text AS pickup_departure_at, pu.actual_departure_source AS pickup_departure_source,
          de.city AS delivery_city, de.state AS delivery_state, de.scheduled_arrival_at::text AS delivery_scheduled_at,
          de.actual_arrival_at::text AS delivery_arrival_at, de.actual_arrival_source AS delivery_arrival_source,
          de.actual_departure_at::text AS delivery_departure_at, de.actual_departure_source AS delivery_departure_source,
          pod.cnt AS delivery_pod_count,
          inv.display_id AS invoice_display_id,
          issue.id::text AS issue_id, issue.issue_category, issue.reported_at::text AS issue_started_at,
          ${reasonsTableExists ? "reason.name" : "NULL"} AS issue_reason_name,
          p.lat::float8 AS pos_lat, p.lng::float8 AS pos_lng,
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

      return { rows: res.rows as Row[], reasonsTableExists };
    });

    const now = Date.now();
    const rows = payload.rows.map((r) => {
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

      let nextAppointment: { type: "pickup" | "delivery"; at: string | null; late: boolean } | null = null;
      if (r.load_id) {
        if (!r.pickup_arrival_at) {
          nextAppointment = {
            type: "pickup",
            at: r.pickup_scheduled_at,
            late: r.pickup_scheduled_at != null && new Date(r.pickup_scheduled_at).getTime() < now,
          };
        } else if (!r.delivery_arrival_at) {
          nextAppointment = {
            type: "delivery",
            at: r.delivery_scheduled_at,
            late: r.delivery_scheduled_at != null && new Date(r.delivery_scheduled_at).getTime() < now,
          };
        }
      }

      const capMs = r.pos_captured_at ? new Date(r.pos_captured_at).getTime() : NaN;
      const staleMinutes = Number.isNaN(capMs) ? null : Math.floor((now - capMs) / 60000);

      return {
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
            }
          : null,
        position: r.pos_captured_at
          ? {
              lat: r.pos_lat,
              lng: r.pos_lng,
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

    return reply.code(200).send({
      rows,
      total_count: rows.length,
      stations: STATION_KEYS.map((key, i) => ({ key, index: i, label: STATION_LABELS[key] })),
      catalog_ready: payload.reasonsTableExists,
    });
  });
}
