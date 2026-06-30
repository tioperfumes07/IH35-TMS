import type { PoolClient } from "pg";

export type DeadheadCalculationMethod = "samsara" | "manual" | "estimated";

export type DeadheadWeekSummary = {
  unit_id: string;
  unit_number: string;
  week_starting: string;
  total_miles: number;
  loaded_miles: number;
  deadhead_miles: number;
  deadhead_pct: number | null;
  load_count: number;
  fleet_avg_deadhead_pct: number | null;
  rank_in_fleet: number | null;
};

export type DeadheadReportResponse = {
  period: { start: string; end: string; label: string };
  fleet: {
    avg_deadhead_pct: number | null;
    total_deadhead_miles: number;
    total_miles: number;
    estimated_deadhead_cost_cents: number;
    truck_count: number;
  };
  units: DeadheadWeekSummary[];
  weekly_trend?: Array<{
    week_starting: string;
    deadhead_pct: number | null;
    deadhead_miles: number;
    loaded_miles: number;
  }>;
};

export type BackhaulSuggestion = {
  origin_city: string;
  origin_state: string;
  destination_city: string;
  destination_state: string;
  load_count: number;
  profit_per_mile_cents: number | null;
  margin_pct: number | null;
  gross_profit_cents: number;
  label: string;
};

type LoadRow = {
  id: string;
  loaded_miles: number | null;
  deadhead_miles_to_pickup: number | null;
  miles_practical: number | null;
  miles_shortest: number | null;
  miles_deadhead: number | null;
  deadhead_miles_calculation_method: DeadheadCalculationMethod | null;
  first_stop_at: string | null;
};

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function roundPct(deadhead: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((deadhead / total) * 10000) / 100;
}

function mondayOfWeek(d: Date): Date {
  const copy = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = copy.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setUTCDate(copy.getUTCDate() + diff);
  return copy;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function resolveLoadedMiles(row: LoadRow): number {
  if (row.loaded_miles != null && row.loaded_miles >= 0) return row.loaded_miles;
  if (row.miles_practical != null && row.miles_practical > 0) return row.miles_practical;
  if (row.miles_shortest != null && row.miles_shortest > 0) return row.miles_shortest;
  return 0;
}

function resolveDeadheadToPickup(row: LoadRow, previousDeliveryCity: string | null, nextPickupCity: string | null): {
  miles: number;
  method: DeadheadCalculationMethod;
} {
  if (row.deadhead_miles_to_pickup != null && row.deadhead_miles_to_pickup >= 0) {
    return {
      miles: row.deadhead_miles_to_pickup,
      method: row.deadhead_miles_calculation_method ?? "manual",
    };
  }
  if (row.miles_deadhead != null && row.miles_deadhead >= 0) {
    return {
      miles: row.miles_deadhead,
      method: row.deadhead_miles_calculation_method ?? "manual",
    };
  }
  if (row.deadhead_miles_calculation_method === "samsara") {
    return { miles: 0, method: "samsara" };
  }
  if (previousDeliveryCity && nextPickupCity && previousDeliveryCity !== nextPickupCity) {
    return { miles: 0, method: "estimated" };
  }
  return { miles: 0, method: "estimated" };
}

export function periodBounds(period: "last_4_weeks" | "last_12_weeks" | "YTD"): { start: string; end: string; label: string } {
  const now = new Date();
  const end = isoDate(now);
  if (period === "YTD") {
    const start = isoDate(new Date(Date.UTC(now.getUTCFullYear(), 0, 1)));
    return { start, end, label: "YTD" };
  }
  const weeks = period === "last_4_weeks" ? 4 : 12;
  const startMonday = mondayOfWeek(addDays(now, -(weeks - 1) * 7));
  return { start: isoDate(startMonday), end, label: period };
}

export async function computeDeadhead(
  client: PoolClient,
  operatingCompanyId: string,
  unitId: string,
  weekStarting: string
): Promise<Omit<DeadheadWeekSummary, "unit_number" | "fleet_avg_deadhead_pct" | "rank_in_fleet">> {
  const weekStart = new Date(`${weekStarting}T00:00:00.000Z`);
  const weekEnd = addDays(weekStart, 7);

  const loadsRes = await client.query<LoadRow & { delivery_city: string | null; pickup_city: string | null }>(
    `
      SELECT
        l.id::text,
        l.loaded_miles,
        l.deadhead_miles_to_pickup,
        l.miles_practical,
        l.miles_shortest,
        l.miles_deadhead,
        l.deadhead_miles_calculation_method,
        (
          SELECT MIN(COALESCE(ls.scheduled_arrival_at, ls.scheduled_departure_at, l.created_at))::text
          FROM mdata.load_stops ls
          WHERE ls.load_id = l.id
        ) AS first_stop_at,
        (
          SELECT NULLIF(TRIM(CONCAT_WS(', ', ls.city, ls.state)), '')
          FROM mdata.load_stops ls
          WHERE ls.load_id = l.id AND ls.stop_type = 'pickup'
          ORDER BY ls.sequence_number ASC
          LIMIT 1
        ) AS pickup_city,
        (
          SELECT NULLIF(TRIM(CONCAT_WS(', ', ls.city, ls.state)), '')
          FROM mdata.load_stops ls
          WHERE ls.load_id = l.id AND ls.stop_type = 'delivery'
          ORDER BY ls.sequence_number DESC
          LIMIT 1
        ) AS delivery_city
      FROM mdata.loads l
      WHERE l.operating_company_id = $1::uuid
        AND l.assigned_unit_id = $2::uuid
        AND l.soft_deleted_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM mdata.load_stops ls
          WHERE ls.load_id = l.id
            AND COALESCE(ls.scheduled_arrival_at, ls.scheduled_departure_at, l.created_at) >= $3::timestamptz
            AND COALESCE(ls.scheduled_arrival_at, ls.scheduled_departure_at, l.created_at) < $4::timestamptz
        )
      ORDER BY first_stop_at ASC NULLS LAST, l.created_at ASC
    `,
    [operatingCompanyId, unitId, weekStart.toISOString(), weekEnd.toISOString()]
  );

  let loadedMiles = 0;
  let deadheadMiles = 0;
  let previousDelivery: string | null = null;

  for (const row of loadsRes.rows) {
    const deadhead = resolveDeadheadToPickup(row, previousDelivery, row.pickup_city);
    deadheadMiles += deadhead.miles;
    loadedMiles += resolveLoadedMiles(row);
    previousDelivery = row.delivery_city;
  }

  const totalMiles = loadedMiles + deadheadMiles;

  return {
    unit_id: unitId,
    week_starting: weekStarting,
    total_miles: totalMiles,
    loaded_miles: loadedMiles,
    deadhead_miles: deadheadMiles,
    deadhead_pct: roundPct(deadheadMiles, totalMiles),
    load_count: loadsRes.rows.length,
  };
}

export async function refreshDeadheadCache(client: PoolClient, operatingCompanyId: string): Promise<number> {
  const unitsRes = await client.query<{ id: string }>(
    `
      SELECT id::text
      FROM mdata.units
      -- Entity scope + phantom-column fix (USMCA): mdata.units has NO operating_company_id column
      -- (the old predicate was a 42703 error that 500'd this refresh). Scope by the owner/leased pair.
      WHERE (owner_company_id = $1::uuid OR currently_leased_to_company_id = $1::uuid)
        AND deactivated_at IS NULL
    `,
    [operatingCompanyId]
  );

  const now = new Date();
  const weekStarts: string[] = [];
  for (let i = 0; i < 12; i += 1) {
    weekStarts.push(isoDate(mondayOfWeek(addDays(now, -i * 7))));
  }

  const summaries: Array<{
    unit_id: string;
    week_starting: string;
    total_miles: number;
    loaded_miles: number;
    deadhead_miles: number;
    deadhead_pct: number | null;
    load_count: number;
  }> = [];

  for (const unit of unitsRes.rows) {
    for (const week of weekStarts) {
      const computed = await computeDeadhead(client, operatingCompanyId, unit.id, week);
      summaries.push(computed);
    }
  }

  for (const week of weekStarts) {
    const weekRows = summaries.filter((s) => s.week_starting === week && s.total_miles > 0);
    const fleetAvg =
      weekRows.length > 0
        ? weekRows.reduce((acc, row) => acc + (row.deadhead_pct ?? 0), 0) / weekRows.length
        : null;
    const ranked = [...weekRows].sort((a, b) => (b.deadhead_pct ?? 0) - (a.deadhead_pct ?? 0));

    for (let i = 0; i < ranked.length; i += 1) {
      const row = ranked[i];
      await client.query(
        `
          INSERT INTO reports.deadhead_cache (
            operating_company_id, unit_id, week_starting,
            total_miles, loaded_miles, deadhead_miles, deadhead_pct, load_count,
            fleet_avg_deadhead_pct, rank_in_fleet, computed_at
          ) VALUES ($1::uuid, $2::uuid, $3::date, $4, $5, $6, $7, $8, $9, $10, NOW())
          ON CONFLICT (unit_id, week_starting) DO UPDATE SET
            operating_company_id = EXCLUDED.operating_company_id,
            total_miles = EXCLUDED.total_miles,
            loaded_miles = EXCLUDED.loaded_miles,
            deadhead_miles = EXCLUDED.deadhead_miles,
            deadhead_pct = EXCLUDED.deadhead_pct,
            load_count = EXCLUDED.load_count,
            fleet_avg_deadhead_pct = EXCLUDED.fleet_avg_deadhead_pct,
            rank_in_fleet = EXCLUDED.rank_in_fleet,
            computed_at = NOW()
        `,
        [
          operatingCompanyId,
          row.unit_id,
          row.week_starting,
          row.total_miles,
          row.loaded_miles,
          row.deadhead_miles,
          row.deadhead_pct,
          row.load_count,
          fleetAvg,
          i + 1,
        ]
      );
    }
  }

  return summaries.length;
}

export async function getDeadheadReport(
  client: PoolClient,
  operatingCompanyId: string,
  period: "last_4_weeks" | "last_12_weeks" | "YTD",
  unitId?: string
): Promise<DeadheadReportResponse> {
  const bounds = periodBounds(period);

  const params: unknown[] = [operatingCompanyId, bounds.start, bounds.end];
  let unitFilter = "";
  if (unitId) {
    params.push(unitId);
    unitFilter = ` AND dc.unit_id = $${params.length}::uuid`;
  }

  const res = await client.query(
    `
      SELECT
        dc.unit_id::text,
        u.unit_number,
        dc.week_starting::text,
        dc.total_miles,
        dc.loaded_miles,
        dc.deadhead_miles,
        dc.deadhead_pct,
        dc.load_count,
        dc.fleet_avg_deadhead_pct,
        dc.rank_in_fleet
      FROM reports.deadhead_cache dc
      JOIN mdata.units u ON u.id = dc.unit_id
      WHERE dc.operating_company_id = $1::uuid
        AND dc.week_starting >= $2::date
        AND dc.week_starting <= $3::date
        ${unitFilter}
      ORDER BY dc.week_starting DESC, dc.deadhead_pct DESC NULLS LAST
    `,
    params
  );

  const units: DeadheadWeekSummary[] = res.rows.map((row) => ({
    unit_id: String(row.unit_id),
    unit_number: String(row.unit_number ?? ""),
    week_starting: String(row.week_starting),
    total_miles: num(row.total_miles),
    loaded_miles: num(row.loaded_miles),
    deadhead_miles: num(row.deadhead_miles),
    deadhead_pct: row.deadhead_pct != null ? num(row.deadhead_pct) : null,
    load_count: num(row.load_count),
    fleet_avg_deadhead_pct: row.fleet_avg_deadhead_pct != null ? num(row.fleet_avg_deadhead_pct) : null,
    rank_in_fleet: row.rank_in_fleet != null ? num(row.rank_in_fleet) : null,
  }));

  const latestByUnit = new Map<string, DeadheadWeekSummary>();
  for (const row of units) {
    if (!latestByUnit.has(row.unit_id)) latestByUnit.set(row.unit_id, row);
  }
  const aggregated = [...latestByUnit.values()].sort((a, b) => (b.deadhead_pct ?? 0) - (a.deadhead_pct ?? 0));

  const totalDeadhead = aggregated.reduce((acc, row) => acc + row.deadhead_miles, 0);
  const totalMiles = aggregated.reduce((acc, row) => acc + row.total_miles, 0);
  const avgPct =
    aggregated.length > 0
      ? aggregated.reduce((acc, row) => acc + (row.deadhead_pct ?? 0), 0) / aggregated.length
      : null;

  const fuelRes = await client.query(
    `
      SELECT
        CASE
          WHEN COALESCE(SUM(ft.total_miles), 0) > 0
          THEN ROUND(SUM(ft.total_cost) / NULLIF(SUM(ft.total_miles), 0) * 100)::bigint
          ELSE 45
        END AS fuel_cost_per_mile_cents
      FROM fuel.fuel_transactions ft
      WHERE ft.operating_company_id = $1::uuid
        AND ft.transaction_date >= $2::date
        AND ft.transaction_date <= $3::date
    `,
    [operatingCompanyId, bounds.start, bounds.end]
  ).catch(() => ({ rows: [{ fuel_cost_per_mile_cents: 45 }] }));

  const fuelCpm = num(fuelRes.rows[0]?.fuel_cost_per_mile_cents) || 45;
  const estimatedCostCents = Math.round(totalDeadhead * fuelCpm * 1.4);

  let weekly_trend: DeadheadReportResponse["weekly_trend"];
  if (unitId) {
    weekly_trend = units
      .filter((row) => row.unit_id === unitId)
      .map((row) => ({
        week_starting: row.week_starting,
        deadhead_pct: row.deadhead_pct,
        deadhead_miles: row.deadhead_miles,
        loaded_miles: row.loaded_miles,
      }))
      .reverse();
  }

  return {
    period: bounds,
    fleet: {
      avg_deadhead_pct: avgPct != null ? Math.round(avgPct * 100) / 100 : null,
      total_deadhead_miles: totalDeadhead,
      total_miles: totalMiles,
      estimated_deadhead_cost_cents: estimatedCostCents,
      truck_count: aggregated.length,
    },
    units: aggregated,
    weekly_trend,
  };
}

export async function getBackhaulSuggestions(
  client: PoolClient,
  operatingCompanyId: string,
  unitId: string
): Promise<{ current_location: string | null; suggestions: BackhaulSuggestion[] }> {
  const locationRes = await client.query<{ city: string | null; state: string | null; label: string | null }>(
    `
      SELECT city, state,
        NULLIF(TRIM(CONCAT_WS(', ', city, state)), '') AS label
      FROM (
        SELECT ls.city, ls.state, l.updated_at
        FROM mdata.loads l
        JOIN mdata.load_stops ls ON ls.load_id = l.id AND ls.stop_type = 'delivery'
        WHERE l.operating_company_id = $1::uuid
          AND l.assigned_unit_id = $2::uuid
          AND l.soft_deleted_at IS NULL
          AND l.status::text IN ('delivered', 'completed')
        ORDER BY l.updated_at DESC, ls.sequence_number DESC
        LIMIT 1
      ) recent
      UNION ALL
      SELECT NULL, NULL, NULL
      LIMIT 1
    `,
    [operatingCompanyId, unitId]
  );

  const current = locationRes.rows[0];
  const currentLocation = current?.label ?? null;

  if (!current?.city || !current?.state) {
    return { current_location: currentLocation, suggestions: [] };
  }

  const lanesRes = await client.query(
    `
      SELECT
        origin_city,
        origin_state,
        destination_city,
        destination_state,
        load_count,
        profit_per_mile_cents,
        margin_pct,
        gross_profit_cents
      FROM reports.lane_profitability_cache
      WHERE operating_company_id = $1::uuid
        AND LOWER(origin_city) = LOWER($2)
        AND LOWER(origin_state) = LOWER($3)
        AND load_count >= 1
      ORDER BY profit_per_mile_cents DESC NULLS LAST, margin_pct DESC NULLS LAST
      LIMIT 5
    `,
    [operatingCompanyId, current.city, current.state]
  );

  const suggestions: BackhaulSuggestion[] = lanesRes.rows.map((row) => ({
    origin_city: String(row.origin_city),
    origin_state: String(row.origin_state),
    destination_city: String(row.destination_city),
    destination_state: String(row.destination_state),
    load_count: num(row.load_count),
    profit_per_mile_cents: row.profit_per_mile_cents != null ? num(row.profit_per_mile_cents) : null,
    margin_pct: row.margin_pct != null ? num(row.margin_pct) : null,
    gross_profit_cents: num(row.gross_profit_cents),
    label: `${row.origin_city}→${row.destination_city}`,
  }));

  return { current_location: currentLocation, suggestions };
}
