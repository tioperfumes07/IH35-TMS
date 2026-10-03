/**
 * ROUND 305 B-48 — every damage / accident / tire event, one row each, with the driver it belongs
 * to or the named reason it belongs to nobody.
 *
 * B-29's scorecard aggregates only events it can attribute, so an empty scorecard looked the same
 * whether the fleet was clean or the data could not reach a driver. Measured 2026-10-01: every one
 * of USMCA's live damage events sits on a unit outside the reporting fleet — ten work orders on
 * REAL trucks gone dark (T149, T150, T151, T120 …, six-figure odometers, years of GPS), five on the
 * USMCA-001 roster placeholder. Those are not test data; they are real trucks with no driver
 * assignment history. This lists them as such instead of silently dropping them.
 *
 * Same rules as B-49 (attributionFor): driver only from the unit's assignment window at the event
 * time, never assigned_driver_id; a covering window with no driver is "no_driver_logged_in", not a
 * guess. Fleet class comes from live-fleet.ts — measured, never a hardcoded fleet size.
 */
import { assignmentInCompanySql, driverAtTimeSql } from "./driver-attribution.js";
import { attributionFor, type FindingGapReason } from "./integrity-findings-attribution.service.js";
import { classifyFleetUnit, fleetUnitFactsSql, type FleetClass } from "../telematics/live-fleet.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type DamageSource = "work_order_repair" | "work_order_accident" | "tire_event" | "safety_accident" | "accident_report";

export type DamageEvent = {
  source: DamageSource;
  event_id: string;
  occurred_at: string | null;
  unit_id: string | null;
  unit_number: string | null;
  unit_fleet_class: FleetClass | "not_in_company_fleet" | null;
  cost_cents: number | null;
  detail: string | null;
  driver_id: string | null;
  attribution: "attributed" | "gap";
  gap_reason: FindingGapReason | null;
  attribution_note: string;
};

export type DamageCoverage = {
  period_start: string;
  period_end: string;
  events: DamageEvent[];
  summary: {
    total: number;
    attributed: number;
    gap: number;
    by_source: Record<string, { total: number; attributed: number }>;
    gap_by_reason: Record<FindingGapReason, number>;
    /** Where the events physically sit — reporting fleet, dark real trucks, placeholders. */
    by_unit_fleet_class: Record<string, number>;
  };
};

type Row = {
  source: DamageSource;
  event_id: string;
  occurred_at: Date | null;
  unit_id: string | null;
  unit_number: string | null;
  cost_cents: string | null;
  detail: string | null;
  driver_id: string | null;
  unit_ever_assigned: boolean;
  covered_at_time: boolean;
};

function eventSelect(sourceExpr: string, idExpr: string, unitExpr: string, tsExpr: string, costExpr: string, detailExpr: string, from: string, where: string): string {
  return `
    SELECT (${sourceExpr})::text AS source, ${idExpr}::text AS event_id, ${tsExpr} AS occurred_at,
           ${unitExpr}::text AS unit_id, u.unit_number, ${costExpr} AS cost_cents, ${detailExpr} AS detail,
           dat.driver_id::text AS driver_id,
           EXISTS (SELECT 1 FROM telematics.vehicle_driver_assignments a
                    WHERE a.operating_company_id = $1::uuid AND ${assignmentInCompanySql("a")} AND a.unit_id = ${unitExpr}) AS unit_ever_assigned,
           EXISTS (SELECT 1 FROM telematics.vehicle_driver_assignments a
                    WHERE a.operating_company_id = $1::uuid AND ${assignmentInCompanySql("a")} AND a.unit_id = ${unitExpr}
                      AND a.started_at <= ${tsExpr} AND (a.ended_at IS NULL OR a.ended_at > ${tsExpr})) AS covered_at_time
      FROM ${from}
      LEFT JOIN mdata.units u ON u.id = ${unitExpr}
      ${driverAtTimeSql(unitExpr, tsExpr, "dat")}
     WHERE ${where} AND ${tsExpr} >= $2::timestamptz AND ${tsExpr} < $3::timestamptz`;
}

export async function computeDamageEventAttribution(
  client: DbClient,
  operatingCompanyId: string,
  periodStart: string,
  periodEnd: string
): Promise<DamageCoverage> {
  const sql = [
    eventSelect(
      "'work_order_' || CASE WHEN wo.wo_type = 'accident' THEN 'accident' ELSE 'repair' END",
      "wo.id", "wo.unit_id", "wo.opened_at",
      "round(COALESCE(wo.total_actual_cost, 0) * 100)::text", "wo.wo_type",
      "maintenance.work_orders wo",
      "wo.operating_company_id = $1::uuid AND wo.voided_at IS NULL AND wo.wo_type IN ('repair', 'accident')"
    ),
    eventSelect(
      "'tire_event'", "te.id", "tr.unit_id", "te.created_at", "NULL::text", "te.event_type",
      "maintenance.tire_events te JOIN maintenance.tire_records tr ON tr.id = te.tire_record_id",
      "te.operating_company_id = $1::uuid"
    ),
    eventSelect(
      "'safety_accident'", "acc.id", "acc.unit_id", "acc.event_datetime", "NULL::text", "NULL::text",
      "safety.accidents acc",
      "acc.operating_company_id = $1::uuid AND acc.voided_at IS NULL"
    ),
    eventSelect(
      "'accident_report'", "ar.id", "ar.unit_id", "ar.accident_at", "NULL::text", "NULL::text",
      "safety.accident_reports ar",
      "ar.operating_company_id = $1::uuid"
    ),
  ].join("\n UNION ALL \n");

  const res = await client.query<Row>(sql + "\n ORDER BY occurred_at DESC NULLS LAST", [operatingCompanyId, periodStart, periodEnd]);

  const facts = await client.query<{ unit_id: string; unit_number: string; is_sample_data: boolean; last_gps_at: Date | null; ever_had_odometer: boolean }>(
    fleetUnitFactsSql(),
    [operatingCompanyId]
  );
  const now = new Date();
  const classById = new Map<string, FleetClass>(
    facts.rows.map((f) => [
      f.unit_id,
      classifyFleetUnit(
        { unitId: f.unit_id, unitNumber: f.unit_number, isSampleData: f.is_sample_data, lastGpsAt: f.last_gps_at ? new Date(f.last_gps_at) : null, everHadOdometer: f.ever_had_odometer },
        now
      ).fleetClass,
    ])
  );

  const events: DamageEvent[] = res.rows.map((r) => ({
    source: r.source,
    event_id: r.event_id,
    occurred_at: r.occurred_at ? new Date(r.occurred_at).toISOString() : null,
    unit_id: r.unit_id,
    unit_number: r.unit_number,
    unit_fleet_class: r.unit_id ? classById.get(r.unit_id) ?? "not_in_company_fleet" : null,
    cost_cents: r.cost_cents === null ? null : Number(r.cost_cents),
    detail: r.detail,
    driver_id: r.driver_id,
    ...attributionFor({
      unit_id: r.unit_id,
      occurred_at: r.occurred_at ? new Date(r.occurred_at) : null,
      driver_id: r.driver_id,
      unit_ever_assigned: r.unit_ever_assigned,
      covered_at_time: r.covered_at_time,
    }),
  }));

  const summary: DamageCoverage["summary"] = {
    total: events.length,
    attributed: 0,
    gap: 0,
    by_source: {},
    gap_by_reason: { no_unit_on_finding: 0, unit_never_assigned: 0, no_driver_logged_in: 0, no_assignment_at_time: 0 },
    by_unit_fleet_class: {},
  };
  for (const e of events) {
    const s = (summary.by_source[e.source] ??= { total: 0, attributed: 0 });
    s.total += 1;
    const cls = e.unit_fleet_class ?? "no_unit";
    summary.by_unit_fleet_class[cls] = (summary.by_unit_fleet_class[cls] ?? 0) + 1;
    if (e.attribution === "attributed") {
      summary.attributed += 1;
      s.attributed += 1;
    } else {
      summary.gap += 1;
      summary.gap_by_reason[e.gap_reason as FindingGapReason] += 1;
    }
  }
  return { period_start: periodStart, period_end: periodEnd, events, summary };
}
