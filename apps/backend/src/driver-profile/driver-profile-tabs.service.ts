/**
 * ORDERS 2026-10-01 row 4 — DRIVER PROFILE backend, one read per tab (Cursor builds the screen).
 * Every tab is scoped to ONE driver of ONE operating company and is read-only.
 *
 * Attribution rule (linkage law, both directions):
 *  - facts that carry their own actor (harsh event driver_id, DVIR signer, DOT inspection driver_id)
 *    are read by that column;
 *  - unit-only facts (fuel fills, engine faults, stops) resolve the driver AT THE EVENT'S OWN TIME via
 *    driverAtTimeSql / unitAtTimeSql — never mdata.units' current driver, never re-inlined.
 * Fuel verdicts are CC-2's (fuel.fraud_alerts, safety.fuel_gps_matches) — composed, not recomputed.
 */
import { driverAtTimeSql } from "../maintenance/driver-attribution.js";
import { fuelPurchaseIneligibleReason, FUEL_ROWS_WITH_STAMP_COUNT_SQL, type FuelRowForEligibility } from "../fuel/fuel-purchase-eligibility.js";
import { computeUnitStops } from "../telematics/unit-stops.service.js";

type Db = { query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };
export type Window = { fromIso: string; toIso: string };

/** Assignment history: every telematics.vehicle_driver_assignments row for the driver (the table driverAtTimeSql reads). */
export async function driverAssignmentHistory(client: Db, oc: string, driverId: string, w: Window) {
  const res = await client.query(
    `SELECT a.id::text, a.unit_id::text, u.unit_number, a.started_at, a.ended_at, a.source, a.is_default
       FROM telematics.vehicle_driver_assignments a
       JOIN mdata.units u ON u.id = a.unit_id
      WHERE a.operating_company_id = $1::uuid AND a.driver_id = $2::uuid
        AND a.started_at < $4::timestamptz AND (a.ended_at IS NULL OR a.ended_at > $3::timestamptz)
      ORDER BY a.started_at DESC`,
    [oc, driverId, w.fromIso, w.toIso]
  );
  return { driver_id: driverId, window: w, assignments: res.rows };
}

async function tableExists(client: Db, schema: string, table: string): Promise<boolean> {
  const r = await client.query(
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2) AS ok`,
    [schema, table]
  );
  return Boolean(r.rows[0]?.ok);
}

/**
 * Stops + miles (E-03/E-44 data). Reads telematics.unit_stop_events by driver_id_at_time once it exists;
 * until then computes E-03 stops over the units the driver held and keeps only stops whose
 * driver-at-time is this driver (source stated in the response).
 */
export async function driverStopsAndMiles(client: Db, oc: string, driverId: string, w: Window) {
  if (await tableExists(client, "telematics", "unit_stop_events")) {
    const res = await client.query(
      `SELECT e.*, u.unit_number FROM telematics.unit_stop_events e JOIN mdata.units u ON u.id = e.unit_id
        WHERE e.driver_id_at_time = $1::uuid AND e.started_at >= $2::timestamptz AND e.started_at < $3::timestamptz
        ORDER BY e.started_at DESC`,
      [driverId, w.fromIso, w.toIso]
    );
    const miles = res.rows.reduce((s, r) => s + (r.miles_since_previous_stop == null ? 0 : Number(r.miles_since_previous_stop)), 0);
    return { source: "unit_stop_events", stops: res.rows, read_miles: Math.round(miles * 10) / 10 };
  }
  const { assignments } = await driverAssignmentHistory(client, oc, driverId, w);
  const unitIds = [...new Set(assignments.map((a) => String(a.unit_id)))];
  const stops: Record<string, unknown>[] = [];
  let miles = 0;
  for (const unitId of unitIds) {
    const r = await computeUnitStops(client as never, { operatingCompanyId: oc, unitId, fromIso: w.fromIso, toIso: w.toIso });
    for (const s of r.stops) {
      if (s.driver_id !== driverId) continue;
      stops.push({ unit_id: unitId, ...s });
      if (s.milesSincePreviousStop != null) miles += s.milesSincePreviousStop;
    }
  }
  return { source: "computed_e03", stops, read_miles: Math.round(miles * 10) / 10 };
}

/** Fuel: fills on units the driver held AT the fill time, each with eligibility + CC-2's verdicts. */
export async function driverFuel(client: Db, oc: string, driverId: string, w: Window) {
  const res = await client.query(
    `WITH f AS (${FUEL_ROWS_WITH_STAMP_COUNT_SQL})
     SELECT f.id::text, f.unit_id::text, u.unit_number, f.transaction_at, f.fuel_type, f.gallons, f.total_cost,
            f.location_city, f.location_state, f.voided_at, f.same_stamp_count, f.load_id::text,
            (SELECT json_agg(json_build_object('rule_id', fa.rule_id, 'severity', fa.severity, 'status', fa.status, 'detected_at', fa.detected_at))
               FROM fuel.fraud_alerts fa WHERE fa.fuel_transaction_uuid = f.id) AS fraud_alerts,
            (SELECT json_build_object('distance_m', m.distance_m, 'confidence', m.confidence, 'review_flag', m.review_flag, 'reason', m.reason)
               FROM safety.fuel_gps_matches m WHERE m.fuel_txn_id = f.id ORDER BY m.matched_at DESC NULLS LAST LIMIT 1) AS gps_match
       FROM f
       JOIN mdata.units u ON u.id = f.unit_id
       ${driverAtTimeSql("f.unit_id", "f.transaction_at")}
      WHERE driver_at_time.driver_id = $2::uuid
        AND f.transaction_at >= $3::timestamptz AND f.transaction_at < $4::timestamptz
      ORDER BY f.transaction_at DESC`,
    [oc, driverId, w.fromIso, w.toIso]
  );
  const rows = res.rows.map((r) => ({
    ...r,
    purchase_ineligible_reason: fuelPurchaseIneligibleReason(r as unknown as FuelRowForEligibility, { requirePumpTime: false }),
  }));
  return { driver_id: driverId, window: w, attribution: "driver_at_fill_time", fills: rows };
}

/** Safety: engine faults (driver at fault time), harsh events, DVIRs (signer), DOT inspection dwell. */
export async function driverSafety(client: Db, oc: string, driverId: string, w: Window) {
  const args = [oc, driverId, w.fromIso, w.toIso];
  // Sequential: one pg client cannot run queries concurrently.
  const faults = await client.query(
      `SELECT h.id::text, h.unit_id::text, u.unit_number, h.fault_code, h.severity, h.occurred_at, h.resolved_at, h.auto_wo_id::text
         FROM maintenance.samsara_fault_code_history h
         JOIN mdata.units u ON u.id = h.unit_id
         ${driverAtTimeSql("h.unit_id", "h.occurred_at")}
        WHERE h.operating_company_id = $1::uuid AND driver_at_time.driver_id = $2::uuid
          AND h.occurred_at >= $3::timestamptz AND h.occurred_at < $4::timestamptz
        ORDER BY h.occurred_at DESC`,
      args
    );
  const harsh = await client.query(
      `SELECT e.id::text, e.unit_id::text, e.event_at, e.event_kind, e.severity, e.speed_at_event_mph, e.g_force
         FROM safety.harsh_events e
        WHERE e.operating_company_id = $1::uuid AND e.driver_id = $2::uuid
          AND e.event_at >= $3::timestamptz AND e.event_at < $4::timestamptz
        ORDER BY e.event_at DESC`,
      args
    );
  const dvirs = await client.query(
      `SELECT d.id::text, d.unit_id::text, u.unit_number, d.type, d.odometer, d.location, d.submitted_at,
              d.has_major_defect, d.has_any_defect, d.client_request_id LIKE 'samsara-dvir:%' AS from_samsara
         FROM safety.dvir_submissions d
         JOIN mdata.units u ON u.id = d.unit_id
        WHERE d.operating_company_id = $1::uuid AND d.driver_id = $2::uuid
          AND d.submitted_at >= $3::timestamptz AND d.submitted_at < $4::timestamptz
        ORDER BY d.submitted_at DESC`,
      args
    );
  const dot = await client.query(
      `SELECT i.id::text, i.unit_id::text, i.station_geofence_id::text, g.label AS station, i.arrived_at, i.departed_at, i.dwell_minutes, i.follow_up_state
         FROM compliance.dot_inspection_events i
         LEFT JOIN geo.geofences g ON g.id = i.station_geofence_id
        WHERE i.operating_company_id = $1::uuid AND i.driver_id = $2::uuid
          AND i.arrived_at >= $3::timestamptz AND i.arrived_at < $4::timestamptz
        ORDER BY i.arrived_at DESC`,
      args
    );
  return { driver_id: driverId, window: w, faults: faults.rows, harsh_events: harsh.rows, dvirs: dvirs.rows, dot_inspections: dot.rows };
}

/**
 * Samsara link + duplicate warning. Accounts come from the CANONICAL map mdata.driver_samsara_accounts
 * (one driver may hold several Samsara accounts). duplicate_warning = another LIVE (not merged) local
 * driver still carries one of these Samsara ids in the legacy mdata.drivers.samsara_driver_id column.
 * Report only -- no merge, no deactivation.
 */
export async function driverSamsaraLink(client: Db, oc: string, driverId: string) {
  const accounts = await client.query(
    `SELECT a.samsara_driver_id::text AS samsara_driver_id, a.samsara_username, a.last_login_at, a.is_active
       FROM mdata.driver_samsara_accounts a JOIN mdata.drivers d ON d.id = a.driver_id
      WHERE a.operating_company_id = $1::uuid AND COALESCE(d.merged_into_driver_id, d.id) = $2::uuid
      ORDER BY a.last_login_at DESC NULLS LAST`,
    [oc, driverId]
  );
  const sids = accounts.rows.map((r) => String(r.samsara_driver_id));
  const legacy = sids.length
    ? await client.query(
        `SELECT o.id::text AS driver_id, concat_ws(' ', o.first_name, o.last_name) AS name, o.status, o.samsara_driver_id::text AS samsara_driver_id
           FROM mdata.drivers o
          WHERE o.operating_company_id = $1::uuid AND o.samsara_driver_id = ANY($2::text[])
            AND o.id <> $3::uuid AND o.merged_into_driver_id IS NULL AND o.deactivated_at IS NULL`,
        [oc, sids, driverId]
      )
    : { rows: [] };
  return { driver_id: driverId, samsara_accounts: accounts.rows, other_live_drivers_with_these_ids: legacy.rows, duplicate_warning: legacy.rows.length > 0 };
}
