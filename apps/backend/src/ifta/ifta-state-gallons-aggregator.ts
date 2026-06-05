import type { QuarterWindow } from "./ifta-state-miles-aggregator.js";

export type StateGallonsRow = {
  state: string;
  gallons: number;
  source: string;
  source_records: Array<{ source: string; gallons: number; count: number }>;
};

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

type RawGallonRow = {
  state: string;
  gallons: string;
  source_kind: string;
  record_count: string;
};

export async function aggregateStateGallons(
  client: Queryable,
  operatingCompanyId: string,
  window: QuarterWindow
): Promise<StateGallonsRow[]> {
  const res = await client.query<RawGallonRow>(
    `
      WITH relay AS (
        SELECT
          UPPER(COALESCE(NULLIF(TRIM(location_state), ''), 'UNKNOWN')) AS state,
          COALESCE(SUM(gallons), 0)::numeric(12, 3) AS gallons,
          COUNT(*)::int AS record_count
        FROM fuel.fuel_transactions
        WHERE operating_company_id = $1::uuid
          AND archived_at IS NULL
          AND purchased_at >= $2::date
          AND purchased_at < $3::date
          AND source IN ('wex', 'efs', 'comdata', 'import')
          AND COALESCE(transaction_reference, '') ILIKE '%relay%'
        GROUP BY UPPER(COALESCE(NULLIF(TRIM(location_state), ''), 'UNKNOWN'))
      ),
      loves AS (
        SELECT
          UPPER(COALESCE(NULLIF(TRIM(location_state), ''), 'UNKNOWN')) AS state,
          COALESCE(SUM(gallons), 0)::numeric(12, 3) AS gallons,
          COUNT(*)::int AS record_count
        FROM fuel.fuel_transactions
        WHERE operating_company_id = $1::uuid
          AND archived_at IS NULL
          AND purchased_at >= $2::date
          AND purchased_at < $3::date
          AND source = 'import'
        GROUP BY UPPER(COALESCE(NULLIF(TRIM(location_state), ''), 'UNKNOWN'))
      ),
      dispatch AS (
        SELECT
          UPPER(COALESCE(NULLIF(TRIM(location_state), ''), 'UNKNOWN')) AS state,
          COALESCE(SUM(gallons), 0)::numeric(12, 3) AS gallons,
          COUNT(*)::int AS record_count
        FROM fuel.fuel_transactions
        WHERE operating_company_id = $1::uuid
          AND archived_at IS NULL
          AND purchased_at >= $2::date
          AND purchased_at < $3::date
          AND source IN ('manual', 'samsara', 'other')
        GROUP BY UPPER(COALESCE(NULLIF(TRIM(location_state), ''), 'UNKNOWN'))
      ),
      ranked AS (
        SELECT state, gallons, record_count, 'relay' AS source_kind, 1 AS priority FROM relay
        UNION ALL
        SELECT state, gallons, record_count, 'loves' AS source_kind, 2 AS priority FROM loves
        UNION ALL
        SELECT state, gallons, record_count, 'dispatch' AS source_kind, 3 AS priority FROM dispatch
      ),
      deduped AS (
        SELECT DISTINCT ON (state)
          state,
          gallons,
          record_count,
          source_kind
        FROM ranked
        WHERE gallons > 0
        ORDER BY state, priority
      )
      SELECT state, gallons, source_kind, record_count::text AS record_count
      FROM deduped
      ORDER BY state
    `,
    [operatingCompanyId, window.startDate, window.endDateExclusive]
  );

  const byState = new Map<string, StateGallonsRow>();
  for (const row of res.rows) {
    const state = String(row.state);
    const gallons = Number(row.gallons ?? 0);
    const sourceKind = String(row.source_kind);
    const count = Number(row.record_count ?? 0);
    const existing = byState.get(state);
    if (!existing) {
      byState.set(state, {
        state,
        gallons,
        source: sourceKind,
        source_records: [{ source: sourceKind, gallons, count }],
      });
      continue;
    }
    existing.gallons += gallons;
    existing.source = "mixed";
    existing.source_records.push({ source: sourceKind, gallons, count });
  }

  return [...byState.values()].sort((a, b) => a.state.localeCompare(b.state));
}
