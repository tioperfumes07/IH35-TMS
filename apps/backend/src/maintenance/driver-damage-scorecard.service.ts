/**
 * B-29 — damage / tire / accident per driver (Lead order, ROUND 297.3).
 *
 * Owner, verbatim: "if too many tires damaged, if a driver has too many accidents or if there are
 * any issues every time he has a truck... it is hard to determine sometimes the damage they cause
 * on vehicles, tires, etc." Every count here is ALSO expressed per 100,000 miles the driver
 * actually drove in the period (via driver-attribution.ts's computeDriverMilesInPeriod, the same
 * definition B-28 uses) — a raw count would libel the hardest-working driver in the fleet, who
 * simply touches more trucks and more miles than anyone else.
 *
 * Attribution: every event below is resolved by unit_id + its own timestamp through
 * driverAtTimeSql (B-27) — never by mdata.units.assigned_driver_id, and never by trusting a
 * stored driver_id column on the event row (work_orders.driver_id is operator-entered at WO
 * creation, not derived from who actually held the unit when the damage happened).
 *
 * Sources (kept separate, never silently merged): maintenance.work_orders (repair + accident
 * wo_types), maintenance.tire_events (via tire_records.unit_id), safety.accidents, and
 * safety.accident_reports — the latter two are DISTINCT live tables (1 row vs 3 rows measured
 * live on USMCA, 2026-09-30) with no confirmed FK linking them; reporting them as two separate
 * counted fields rather than guessing they are duplicates of each other.
 */
import { driverAtTimeSql, resolveDriverMilesInPeriod, type MilesSource } from "./driver-attribution.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

type SourceAggRow = {
  driver_id: string;
  event_count: string;
  cost_cents: string | null;
  down_days: string | null;
};

type SourceAgg = { count: number; costCents: number; downDays: number };

async function aggregateWorkOrders(
  client: DbClient,
  operatingCompanyId: string,
  periodStart: string,
  periodEnd: string,
  woTypes: string[]
): Promise<Map<string, SourceAgg>> {
  const res = await client.query<SourceAggRow>(
    `
    SELECT
      dat.driver_id::text AS driver_id,
      count(*)::text AS event_count,
      sum(round(COALESCE(wo.total_actual_cost, 0) * 100))::text AS cost_cents,
      sum(
        CASE
          WHEN wo.out_of_service AND wo.work_started_at IS NOT NULL AND wo.work_completed_at IS NOT NULL
          THEN GREATEST(extract(epoch FROM (wo.work_completed_at - wo.work_started_at)) / 86400.0, 0)
          ELSE 0
        END
      )::text AS down_days
    FROM maintenance.work_orders wo
    ${driverAtTimeSql("wo.unit_id", "wo.opened_at", "dat")}
    WHERE wo.operating_company_id = $1::uuid
      AND wo.voided_at IS NULL
      AND wo.unit_id IS NOT NULL
      AND wo.opened_at >= $2::timestamptz AND wo.opened_at < $3::timestamptz
      AND wo.wo_type = ANY($4::text[])
      AND dat.driver_id IS NOT NULL
    GROUP BY dat.driver_id
    `,
    [operatingCompanyId, periodStart, periodEnd, woTypes]
  );
  return rowsToMap(res.rows);
}

async function aggregateTireEvents(
  client: DbClient,
  operatingCompanyId: string,
  periodStart: string,
  periodEnd: string
): Promise<Map<string, SourceAgg>> {
  const res = await client.query<SourceAggRow>(
    `
    SELECT
      dat.driver_id::text AS driver_id,
      count(*)::text AS event_count,
      '0'::text AS cost_cents,
      '0'::text AS down_days
    FROM maintenance.tire_events te
    JOIN maintenance.tire_records tr ON tr.id = te.tire_record_id
    ${driverAtTimeSql("tr.unit_id", "te.created_at", "dat")}
    WHERE tr.operating_company_id = $1::uuid
      AND tr.unit_id IS NOT NULL
      AND te.created_at >= $2::timestamptz AND te.created_at < $3::timestamptz
      AND dat.driver_id IS NOT NULL
    GROUP BY dat.driver_id
    `,
    [operatingCompanyId, periodStart, periodEnd]
  );
  return rowsToMap(res.rows);
}

async function aggregateSafetyAccidents(
  client: DbClient,
  operatingCompanyId: string,
  periodStart: string,
  periodEnd: string
): Promise<Map<string, SourceAgg>> {
  const res = await client.query<SourceAggRow>(
    `
    SELECT
      dat.driver_id::text AS driver_id,
      count(*)::text AS event_count,
      '0'::text AS cost_cents,
      '0'::text AS down_days
    FROM safety.accidents acc
    ${driverAtTimeSql("acc.unit_id", "acc.event_datetime", "dat")}
    WHERE acc.operating_company_id = $1::uuid
      AND acc.voided_at IS NULL
      AND acc.unit_id IS NOT NULL
      AND acc.event_datetime >= $2::timestamptz AND acc.event_datetime < $3::timestamptz
      AND dat.driver_id IS NOT NULL
    GROUP BY dat.driver_id
    `,
    [operatingCompanyId, periodStart, periodEnd]
  );
  return rowsToMap(res.rows);
}

async function aggregateAccidentReports(
  client: DbClient,
  operatingCompanyId: string,
  periodStart: string,
  periodEnd: string
): Promise<Map<string, SourceAgg>> {
  const res = await client.query<SourceAggRow>(
    `
    SELECT
      dat.driver_id::text AS driver_id,
      count(*)::text AS event_count,
      '0'::text AS cost_cents,
      '0'::text AS down_days
    FROM safety.accident_reports ar
    ${driverAtTimeSql("ar.unit_id", "ar.accident_at", "dat")}
    WHERE ar.operating_company_id = $1::uuid
      AND ar.unit_id IS NOT NULL
      AND ar.accident_at >= $2::timestamptz AND ar.accident_at < $3::timestamptz
      AND dat.driver_id IS NOT NULL
    GROUP BY dat.driver_id
    `,
    [operatingCompanyId, periodStart, periodEnd]
  );
  return rowsToMap(res.rows);
}

function rowsToMap(rows: SourceAggRow[]): Map<string, SourceAgg> {
  const out = new Map<string, SourceAgg>();
  for (const row of rows) {
    out.set(row.driver_id, {
      count: Number(row.event_count),
      costCents: Number(row.cost_cents ?? 0),
      downDays: Number(row.down_days ?? 0),
    });
  }
  return out;
}

export type DriverDamageScorecardRow = {
  /** E-27: which miles the per-100k figures divide by — shown on screen, never implied. */
  miles_source: MilesSource;
  miles_source_label: string;
  driver_id: string;
  period_start: string;
  period_end: string;
  miles_driven: number | null;
  damage_wo_count: number;
  accident_wo_count: number;
  safety_accident_count: number;
  accident_report_count: number;
  tire_event_count: number;
  total_cost_cents: number;
  down_days: number;
  /** null when miles_driven is null (odometer gap) — never divided against an unknown denominator. */
  damage_wo_per_100k_miles: number | null;
  accident_wo_per_100k_miles: number | null;
  tire_event_per_100k_miles: number | null;
  cost_cents_per_100k_miles: number | null;
};

const ZERO_AGG: SourceAgg = { count: 0, costCents: 0, downDays: 0 };

export async function computeDriverDamageScorecard(
  client: DbClient,
  operatingCompanyId: string,
  periodStart: string,
  periodEnd: string
): Promise<DriverDamageScorecardRow[]> {
  // Sequential on one client: concurrent queries on a single pg client are deprecated and can
  // interleave. Six reads; latency is not the constraint here, correctness is.
  const damageWo = await aggregateWorkOrders(client, operatingCompanyId, periodStart, periodEnd, ["repair"]);
  const accidentWo = await aggregateWorkOrders(client, operatingCompanyId, periodStart, periodEnd, ["accident"]);
  const tireEvents = await aggregateTireEvents(client, operatingCompanyId, periodStart, periodEnd);
  const safetyAccidents = await aggregateSafetyAccidents(client, operatingCompanyId, periodStart, periodEnd);
  const accidentReports = await aggregateAccidentReports(client, operatingCompanyId, periodStart, periodEnd);
  const resolvedMiles = await resolveDriverMilesInPeriod(client, operatingCompanyId, periodStart, periodEnd);
  const milesByDriver = resolvedMiles.byDriver;

  const driverIds = new Set<string>([
    ...damageWo.keys(),
    ...accidentWo.keys(),
    ...tireEvents.keys(),
    ...safetyAccidents.keys(),
    ...accidentReports.keys(),
  ]);

  const rows: DriverDamageScorecardRow[] = [];
  for (const driverId of driverIds) {
    const dmg = damageWo.get(driverId) ?? ZERO_AGG;
    const acc = accidentWo.get(driverId) ?? ZERO_AGG;
    const tire = tireEvents.get(driverId) ?? ZERO_AGG;
    const safAcc = safetyAccidents.get(driverId) ?? ZERO_AGG;
    const accRep = accidentReports.get(driverId) ?? ZERO_AGG;
    const miles = milesByDriver.get(driverId)?.miles ?? null;

    const totalCostCents = dmg.costCents + acc.costCents;
    const downDays = dmg.downDays + acc.downDays;

    const per100k = (count: number): number | null => {
      if (miles == null || miles <= 0) return null;
      return Number(((count / miles) * 100_000).toFixed(2));
    };

    rows.push({
      driver_id: driverId,
      period_start: periodStart,
      period_end: periodEnd,
      miles_source: resolvedMiles.source,
      miles_source_label: resolvedMiles.label,
      miles_driven: miles,
      damage_wo_count: dmg.count,
      accident_wo_count: acc.count,
      safety_accident_count: safAcc.count,
      accident_report_count: accRep.count,
      tire_event_count: tire.count,
      total_cost_cents: totalCostCents,
      down_days: Number(downDays.toFixed(1)),
      damage_wo_per_100k_miles: per100k(dmg.count),
      accident_wo_per_100k_miles: per100k(acc.count),
      tire_event_per_100k_miles: per100k(tire.count),
      cost_cents_per_100k_miles: miles != null && miles > 0 ? Number(((totalCostCents / miles) * 100_000).toFixed(0)) : null,
    });
  }

  return rows.sort((a, b) => a.driver_id.localeCompare(b.driver_id));
}
