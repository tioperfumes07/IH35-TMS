type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export type DriverMetricPeriod = "monthly" | "quarterly" | "ytd";

export const DRIVER_METRIC_NAMES = [
  "fuel_per_mile",
  "repairs_per_month",
  "accidents_per_quarter",
  "tire_replacement_rate",
  "battery_replacement_rate",
  "airbag_replacement_rate",
  "brake_replacement_rate",
  "average_repair_cost",
] as const;

export type DriverMetricName = (typeof DRIVER_METRIC_NAMES)[number];

export type MetricComparison = {
  value: number | null;
  peer_median: number | null;
  peer_p25: number | null;
  peer_p75: number | null;
  ratio_to_median: number | null;
  flagged: boolean;
};

export type DriverMetricSnapshot = {
  driver_id: string;
  driver_name: string;
  months_active: number;
  metrics: Record<DriverMetricName, MetricComparison>;
};

export type PeriodBounds = {
  period: DriverMetricPeriod;
  asof: string;
  period_start: string;
  period_end: string;
  months_active: number;
};

export type DriverMetricRawRow = {
  driver_id: string;
  driver_name: string;
  fuel_spend: number;
  gallons: number;
  odometer_delta: number;
  wo_count: number;
  accident_count: number;
  tire_lines: number;
  battery_lines: number;
  airbag_lines: number;
  brake_lines: number;
  avg_repair_cost: number | null;
};

const DEFAULT_FLAG_RATIO = 1.5;

function parseDateOnly(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) throw new Error("invalid_asof");
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month, day));
  if (Number.isNaN(date.getTime())) throw new Error("invalid_asof");
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month ||
    date.getUTCDate() !== day
  ) {
    throw new Error("invalid_asof");
  }
  return date;
}

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function resolvePeriodBounds(period: DriverMetricPeriod, asof: string): PeriodBounds {
  const anchor = parseDateOnly(asof);
  const endExclusive = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate() + 1));
  const end = formatDateOnly(endExclusive);

  if (period === "monthly") {
    const start = formatDateOnly(new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1)));
    return { period, asof, period_start: start, period_end: end, months_active: 1 };
  }

  if (period === "quarterly") {
    const quarterStartMonth = Math.floor(anchor.getUTCMonth() / 3) * 3;
    const start = formatDateOnly(new Date(Date.UTC(anchor.getUTCFullYear(), quarterStartMonth, 1)));
    return { period, asof, period_start: start, period_end: end, months_active: 3 };
  }

  const start = formatDateOnly(new Date(Date.UTC(anchor.getUTCFullYear(), 0, 1)));
  const monthsActive = anchor.getUTCMonth() + 1;
  return { period, asof, period_start: start, period_end: end, months_active: monthsActive };
}

export function quantile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sorted[base + 1];
  if (next === undefined) return sorted[base] ?? null;
  return (sorted[base] ?? 0) + rest * (next - (sorted[base] ?? 0));
}

export function computePeerComparison(
  value: number | null,
  peerValues: number[],
  threshold = DEFAULT_FLAG_RATIO
): MetricComparison {
  const finitePeers = peerValues.filter((entry) => Number.isFinite(entry));
  if (value === null || !Number.isFinite(value)) {
    return {
      value,
      peer_median: quantile(finitePeers, 0.5),
      peer_p25: quantile(finitePeers, 0.25),
      peer_p75: quantile(finitePeers, 0.75),
      ratio_to_median: null,
      flagged: false,
    };
  }

  const sorted = [...finitePeers].sort((a, b) => a - b);
  const peerMedian = quantile(sorted, 0.5);
  const ratio = peerMedian && peerMedian > 0 ? value / peerMedian : null;
  return {
    value,
    peer_median: peerMedian,
    peer_p25: quantile(sorted, 0.25),
    peer_p75: quantile(sorted, 0.75),
    ratio_to_median: ratio,
    flagged: ratio !== null && ratio > threshold,
  };
}

function num(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNum(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function deriveDriverMetricValues(row: DriverMetricRawRow, monthsActive: number): Record<DriverMetricName, number | null> {
  const months = Math.max(1, monthsActive);
  const quarterMonths = Math.max(1, months / 3);
  const fuelPerMile = row.odometer_delta > 0 ? row.fuel_spend / row.odometer_delta : null;

  return {
    fuel_per_mile: fuelPerMile,
    repairs_per_month: row.wo_count / months,
    accidents_per_quarter: row.accident_count / quarterMonths,
    tire_replacement_rate: row.tire_lines / months,
    battery_replacement_rate: row.battery_lines / months,
    airbag_replacement_rate: row.airbag_lines / months,
    brake_replacement_rate: row.brake_lines / months,
    average_repair_cost: row.avg_repair_cost,
  };
}

export function buildDriverMetricSnapshots(rows: DriverMetricRawRow[], bounds: PeriodBounds, threshold = DEFAULT_FLAG_RATIO): DriverMetricSnapshot[] {
  const valueMatrix = rows.map((row) => deriveDriverMetricValues(row, bounds.months_active));
  const peerByMetric = Object.fromEntries(
    DRIVER_METRIC_NAMES.map((metric) => [
      metric,
      valueMatrix
        .map((values) => values[metric])
        .filter((value): value is number => value !== null && Number.isFinite(value)),
    ])
  ) as Record<DriverMetricName, number[]>;

  return rows.map((row, index) => {
    const values = valueMatrix[index]!;
    const metrics = Object.fromEntries(
      DRIVER_METRIC_NAMES.map((metric) => [metric, computePeerComparison(values[metric], peerByMetric[metric], threshold)])
    ) as Record<DriverMetricName, MetricComparison>;

    return {
      driver_id: row.driver_id,
      driver_name: row.driver_name,
      months_active: bounds.months_active,
      metrics,
    };
  });
}

export function buildDriverMetricsLeaderboard(
  snapshots: DriverMetricSnapshot[],
  metric: DriverMetricName,
  direction: "high" | "low",
  limit: number
) {
  const sorted = [...snapshots].sort((left, right) => {
    const leftValue = left.metrics[metric].value;
    const rightValue = right.metrics[metric].value;
    if (leftValue === null && rightValue === null) return left.driver_name.localeCompare(right.driver_name);
    if (leftValue === null) return 1;
    if (rightValue === null) return -1;
    if (leftValue === rightValue) return left.driver_name.localeCompare(right.driver_name);
    return direction === "high" ? rightValue - leftValue : leftValue - rightValue;
  });

  return sorted.slice(0, Math.max(1, limit)).map((entry, index) => ({
    rank: index + 1,
    driver_id: entry.driver_id,
    driver_name: entry.driver_name,
    metric,
    ...entry.metrics[metric],
  }));
}

export function buildDriverMetricsAggregationSql(): string {
  return `
    WITH bounds AS (
      SELECT
        $2::date::timestamptz AS period_start,
        ($3::date + interval '1 day')::timestamptz AS period_end,
        GREATEST($4::numeric, 1) AS months_active
    ),
    active_drivers AS (
      SELECT
        d.id::text AS driver_id,
        NULLIF(trim(CONCAT_WS(' ', d.first_name, d.last_name)), '') AS driver_name
      FROM mdata.drivers d
      WHERE d.operating_company_id = $1::uuid
        AND COALESCE(d.active, true) = true
        AND COALESCE(d.deactivated_at, NULL) IS NULL
    ),
    fuel_agg AS (
      SELECT
        ft.driver_id::text AS driver_id,
        COALESCE(SUM(COALESCE(ft.total_cost, ft.gallons * ft.price_per_gallon, 0)), 0)::numeric AS fuel_spend,
        COALESCE(SUM(ft.gallons), 0)::numeric AS gallons
      FROM fuel.fuel_transactions ft
      CROSS JOIN bounds b
      WHERE ft.operating_company_id = $1::uuid
        AND ft.driver_id IS NOT NULL
        AND ft.purchased_at >= b.period_start
        AND ft.purchased_at < b.period_end
      GROUP BY ft.driver_id
    ),
    odometer_agg AS (
      SELECT
        e.driver_id::text AS driver_id,
        GREATEST(
          0,
          MAX(e.odometer_mi) FILTER (WHERE e.odometer_mi IS NOT NULL)
            - MIN(e.odometer_mi) FILTER (WHERE e.odometer_mi IS NOT NULL)
        )::numeric AS odometer_delta
      FROM hos.duty_status_events e
      CROSS JOIN bounds b
      WHERE e.operating_company_id = $1::uuid
        AND e.driver_id IS NOT NULL
        AND e.started_at >= b.period_start
        AND e.started_at < b.period_end
      GROUP BY e.driver_id
      HAVING COUNT(*) FILTER (WHERE e.odometer_mi IS NOT NULL) >= 2
    ),
    wo_agg AS (
      SELECT
        w.driver_id::text AS driver_id,
        COUNT(*)::numeric AS wo_count,
        AVG(
          COALESCE(
            w.total_actual_cost,
            CASE WHEN w.estimated_cost_cents IS NOT NULL THEN w.estimated_cost_cents::numeric / 100.0 ELSE NULL END,
            0
          )
        )::numeric AS avg_repair_cost
      FROM maintenance.work_orders w
      CROSS JOIN bounds b
      WHERE w.operating_company_id = $1::uuid
        AND w.driver_id IS NOT NULL
        AND COALESCE(w.opened_at, w.created_at) >= b.period_start
        AND COALESCE(w.opened_at, w.created_at) < b.period_end
      GROUP BY w.driver_id
    ),
    accident_agg AS (
      SELECT
        ar.driver_id::text AS driver_id,
        COUNT(*)::numeric AS accident_count
      FROM safety.accident_reports ar
      CROSS JOIN bounds b
      WHERE ar.operating_company_id = $1::uuid
        AND ar.driver_id IS NOT NULL
        AND ar.accident_at >= b.period_start
        AND ar.accident_at < b.period_end
      GROUP BY ar.driver_id
    ),
    part_lines AS (
      SELECT
        w.driver_id::text AS driver_id,
        COUNT(*) FILTER (
          WHERE lower(COALESCE(p.category, '')) = 'tire'
             OR lower(COALESCE(w.wo_type, '')) = 'tire'
        )::numeric AS tire_lines,
        COUNT(*) FILTER (
          WHERE lower(COALESCE(p.category, '')) IN ('battery', 'electrical')
             AND (
               lower(COALESCE(p.name, '')) LIKE '%batt%'
               OR lower(COALESCE(p.sku, '')) LIKE '%batt%'
             )
        )::numeric AS battery_lines,
        COUNT(*) FILTER (
          WHERE lower(COALESCE(p.category, '')) IN ('airbag', 'suspension')
             AND (
               lower(COALESCE(p.name, '')) LIKE '%air%bag%'
               OR lower(COALESCE(p.sku, '')) LIKE '%air%bag%'
             )
        )::numeric AS airbag_lines,
        COUNT(*) FILTER (
          WHERE lower(COALESCE(p.category, '')) = 'brake'
        )::numeric AS brake_lines
      FROM maintenance.work_orders w
      JOIN maintenance.work_order_lines wl
        ON wl.work_order_uuid = w.id
      LEFT JOIN maint.part p
        ON p.id = wl.part_uuid
       AND p.tenant_id = w.operating_company_id
      CROSS JOIN bounds b
      WHERE w.operating_company_id = $1::uuid
        AND w.driver_id IS NOT NULL
        AND COALESCE(w.opened_at, w.created_at) >= b.period_start
        AND COALESCE(w.opened_at, w.created_at) < b.period_end
        AND wl.line_type IN ('part', 'parts')
      GROUP BY w.driver_id
    )
    SELECT
      d.driver_id,
      COALESCE(d.driver_name, d.driver_id) AS driver_name,
      COALESCE(f.fuel_spend, 0) AS fuel_spend,
      COALESCE(f.gallons, 0) AS gallons,
      COALESCE(o.odometer_delta, 0) AS odometer_delta,
      COALESCE(w.wo_count, 0) AS wo_count,
      COALESCE(a.accident_count, 0) AS accident_count,
      COALESCE(pl.tire_lines, 0) AS tire_lines,
      COALESCE(pl.battery_lines, 0) AS battery_lines,
      COALESCE(pl.airbag_lines, 0) AS airbag_lines,
      COALESCE(pl.brake_lines, 0) AS brake_lines,
      w.avg_repair_cost
    FROM active_drivers d
    LEFT JOIN fuel_agg f ON f.driver_id = d.driver_id
    LEFT JOIN odometer_agg o ON o.driver_id = d.driver_id
    LEFT JOIN wo_agg w ON w.driver_id = d.driver_id
    LEFT JOIN accident_agg a ON a.driver_id = d.driver_id
    LEFT JOIN part_lines pl ON pl.driver_id = d.driver_id
    ORDER BY d.driver_name ASC
  `;
}

export async function fetchDriverMetricRows(
  client: Queryable,
  operatingCompanyId: string,
  bounds: PeriodBounds
): Promise<DriverMetricRawRow[]> {
  const result = await client.query(
    buildDriverMetricsAggregationSql(),
    [operatingCompanyId, bounds.period_start, bounds.asof, bounds.months_active]
  );

  return result.rows.map((row) => ({
    driver_id: String(row.driver_id),
    driver_name: String(row.driver_name ?? row.driver_id),
    fuel_spend: num(row.fuel_spend),
    gallons: num(row.gallons),
    odometer_delta: num(row.odometer_delta),
    wo_count: num(row.wo_count),
    accident_count: num(row.accident_count),
    tire_lines: num(row.tire_lines),
    battery_lines: num(row.battery_lines),
    airbag_lines: num(row.airbag_lines),
    brake_lines: num(row.brake_lines),
    avg_repair_cost: nullableNum(row.avg_repair_cost),
  }));
}

export async function getDriverMetricsForTenant(
  client: Queryable,
  operatingCompanyId: string,
  bounds: PeriodBounds,
  driverId?: string,
  flagRatio = DEFAULT_FLAG_RATIO
) {
  const rows = await fetchDriverMetricRows(client, operatingCompanyId, bounds);
  const snapshots = buildDriverMetricSnapshots(rows, bounds, flagRatio);
  if (!driverId) {
    return { bounds, drivers: snapshots };
  }

  const driver = snapshots.find((entry) => entry.driver_id === driverId) ?? null;
  return { bounds, drivers: snapshots, driver };
}
