/**
 * ROUND 305 B-49 — attribute the geofence integrity findings to drivers, and state the rest as a gap.
 *
 * safety.integrity_findings is written by the geofence integrity cron (one row per anomaly, keyed
 * to unit_id + occurred_at, NO driver). This does not build a second findings table and does not
 * touch that cron: it resolves the driver ON READ through driverAtTimeSql (B-27) — the truck's
 * assignment window at the moment of the finding — never mdata.units.assigned_driver_id.
 *
 * A finding the engine cannot place is NEVER attributed. It comes back with driver_id = null and a
 * gap_reason that names exactly why:
 *   no_unit_on_finding      the finding row carries no unit_id at all
 *   unit_never_assigned     the unit has no vehicle_driver_assignments row, ever
 *   no_driver_logged_in     an assignment window covers occurred_at but records NO driver (Samsara:
 *                           the truck was in use with nobody signed in) — itself worth a look
 *   no_assignment_at_time   the unit has assignments, but none covers occurred_at
 * plus the unit's live-fleet class (reporting / dark / sample / no_telemetry_ever) so a gap on a
 * real truck gone dark reads differently from a gap on a roster placeholder.
 *
 * Linkage both ways: finding -> driver (driver_id on every attributed row) and driver -> findings
 * (the same query filtered by the attributed driver).
 */
import { assignmentInCompanySql, driverAtTimeSql } from "./driver-attribution.js";
import { classifyFleetUnit, fleetUnitFactsSql, type FleetClass } from "../telematics/live-fleet.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type FindingGapReason = "no_unit_on_finding" | "unit_never_assigned" | "no_driver_logged_in" | "no_assignment_at_time";

export type AttributedFinding = {
  finding_id: string;
  anomaly_class: string;
  report_date: string | null;
  occurred_at: string | null;
  unit_id: string | null;
  unit_number: string | null;
  unit_fleet_class: FleetClass | null;
  geofence_id: string | null;
  load_id: string | null;
  resolved: boolean;
  details: unknown;
  driver_id: string | null;
  attribution: "attributed" | "gap";
  gap_reason: FindingGapReason | null;
  /** Plain words. Never empty. */
  attribution_note: string;
};

export type FindingsAttributionSummary = {
  total: number;
  attributed: number;
  gap: number;
  by_anomaly_class: Record<string, { total: number; attributed: number; gap: number }>;
  gap_by_reason: Record<FindingGapReason, number>;
};

type Row = {
  finding_id: string;
  anomaly_class: string;
  report_date: string | null;
  occurred_at: Date | null;
  unit_id: string | null;
  unit_number: string | null;
  geofence_id: string | null;
  load_id: string | null;
  resolved: boolean;
  details: unknown;
  driver_id: string | null;
  unit_ever_assigned: boolean;
  covered_at_time: boolean;
};

/** Pure: the note for one row. Exported so the guard checks every branch offline. */
export function attributionFor(row: {
  unit_id: string | null;
  occurred_at: Date | null;
  driver_id: string | null;
  unit_ever_assigned: boolean;
  covered_at_time: boolean;
}): { attribution: "attributed" | "gap"; gap_reason: FindingGapReason | null; attribution_note: string } {
  if (row.driver_id) {
    return {
      attribution: "attributed",
      gap_reason: null,
      attribution_note: "driver holding the truck at occurred_at, from telematics.vehicle_driver_assignments",
    };
  }
  if (!row.unit_id) {
    return { attribution: "gap", gap_reason: "no_unit_on_finding", attribution_note: "finding carries no unit — nothing to attribute through" };
  }
  if (!row.unit_ever_assigned) {
    return {
      attribution: "gap",
      gap_reason: "unit_never_assigned",
      attribution_note: "this unit has never had a driver assignment on record — telemetry coverage gap, not attributed",
    };
  }
  if (row.covered_at_time) {
    return {
      attribution: "gap",
      gap_reason: "no_driver_logged_in",
      attribution_note:
        "the assignment window covering this moment records NO driver — the truck was in use with nobody signed in; not attributed to anyone",
    };
  }
  return {
    attribution: "gap",
    gap_reason: "no_assignment_at_time",
    attribution_note: row.occurred_at
      ? "the unit has assignments, but none covers this moment — not attributed to the nearest one"
      : "finding has no occurred_at — cannot be placed in any assignment window",
  };
}

export async function listIntegrityFindingsAttribution(
  client: DbClient,
  operatingCompanyId: string,
  opts: { driverId?: string | null; periodStart?: string | null; periodEnd?: string | null } = {}
): Promise<{ rows: AttributedFinding[]; summary: FindingsAttributionSummary }> {
  const res = await client.query<Row>(
    `
    SELECT f.uuid::text AS finding_id, f.anomaly_class, f.report_date::text AS report_date, f.occurred_at,
           f.unit_id, u.unit_number, f.geofence_id::text AS geofence_id, f.load_uuid::text AS load_id,
           coalesce(f.resolved, false) AS resolved, f.details,
           dat.driver_id::text AS driver_id,
           EXISTS (SELECT 1 FROM telematics.vehicle_driver_assignments a
                    WHERE a.operating_company_id = $1::uuid AND ${assignmentInCompanySql("a")} AND a.unit_id::text = f.unit_id) AS unit_ever_assigned,
           EXISTS (SELECT 1 FROM telematics.vehicle_driver_assignments a
                    WHERE a.operating_company_id = $1::uuid AND ${assignmentInCompanySql("a")} AND a.unit_id::text = f.unit_id
                      AND a.started_at <= f.occurred_at AND (a.ended_at IS NULL OR a.ended_at > f.occurred_at)) AS covered_at_time
      FROM safety.integrity_findings f
      LEFT JOIN mdata.units u ON u.id::text = f.unit_id
      ${driverAtTimeSql("u.id", "f.occurred_at", "dat")}
     WHERE f.operating_company_id = $1::uuid
       AND ($2::timestamptz IS NULL OR f.occurred_at >= $2::timestamptz)
       AND ($3::timestamptz IS NULL OR f.occurred_at < $3::timestamptz)
     ORDER BY f.occurred_at DESC NULLS LAST, f.uuid
    `,
    [operatingCompanyId, opts.periodStart ?? null, opts.periodEnd ?? null]
  );

  const facts = await client.query<{
    unit_id: string;
    unit_number: string;
    is_sample_data: boolean;
    last_gps_at: Date | null;
    ever_had_odometer: boolean;
  }>(fleetUnitFactsSql(), [operatingCompanyId]);
  const now = new Date();
  const classById = new Map<string, FleetClass>(
    facts.rows.map((f) => [
      f.unit_id,
      classifyFleetUnit(
        {
          unitId: f.unit_id,
          unitNumber: f.unit_number,
          isSampleData: f.is_sample_data,
          lastGpsAt: f.last_gps_at ? new Date(f.last_gps_at) : null,
          everHadOdometer: f.ever_had_odometer,
        },
        now
      ).fleetClass,
    ])
  );

  const all: AttributedFinding[] = res.rows.map((r) => ({
    finding_id: r.finding_id,
    anomaly_class: r.anomaly_class,
    report_date: r.report_date,
    occurred_at: r.occurred_at ? new Date(r.occurred_at).toISOString() : null,
    unit_id: r.unit_id,
    unit_number: r.unit_number,
    unit_fleet_class: r.unit_id ? classById.get(r.unit_id) ?? null : null,
    geofence_id: r.geofence_id,
    load_id: r.load_id,
    resolved: r.resolved,
    details: r.details,
    driver_id: r.driver_id,
    ...attributionFor({
      unit_id: r.unit_id,
      occurred_at: r.occurred_at ? new Date(r.occurred_at) : null,
      driver_id: r.driver_id,
      unit_ever_assigned: r.unit_ever_assigned,
      covered_at_time: r.covered_at_time,
    }),
  }));

  // The summary always describes the whole population; the driver filter narrows rows only, so a
  // per-driver view still shows how much of the fleet's findings could not be placed at all.
  const summary: FindingsAttributionSummary = {
    total: all.length,
    attributed: 0,
    gap: 0,
    by_anomaly_class: {},
    gap_by_reason: { no_unit_on_finding: 0, unit_never_assigned: 0, no_driver_logged_in: 0, no_assignment_at_time: 0 },
  };
  for (const f of all) {
    const c = (summary.by_anomaly_class[f.anomaly_class] ??= { total: 0, attributed: 0, gap: 0 });
    c.total += 1;
    if (f.attribution === "attributed") {
      summary.attributed += 1;
      c.attributed += 1;
    } else {
      summary.gap += 1;
      c.gap += 1;
      summary.gap_by_reason[f.gap_reason as FindingGapReason] += 1;
    }
  }

  const rows = opts.driverId ? all.filter((f) => f.driver_id === opts.driverId) : all;
  return { rows, summary };
}
