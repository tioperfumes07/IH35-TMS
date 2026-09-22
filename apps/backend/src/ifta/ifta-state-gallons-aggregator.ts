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
      -- IFTA-GALLONS-01 (2026-09-23). This query previously built three CTEs (relay / loves /
      -- dispatch) partitioned by "source", UNIONed them, then applied
      -- "DISTINCT ON (state) ... ORDER BY state, priority". That kept ONE source per jurisdiction
      -- and silently DISCARDED the other two. The three populations are disjoint real purchases,
      -- not competing views of the same purchase, so every state that bought fuel on more than one
      -- rail had gallons dropped from the return. MEASURED live on USMCA, 2026-09-23: the old
      -- shape reported 39,258.24 gallons against 46,994.85 actual taxable diesel gallons —
      -- 7,736.61 gallons (16.5%) missing. "relay" and "loves" also overlapped (both could match
      -- source='import'), so the same row could be counted under either label.
      --
      -- Now: ONE scan, each row counted exactly once, grouped by jurisdiction. The source label is
      -- derived per row for reporting only and never partitions the sum.
      --
      -- FUEL TYPE: IFTA is GALLON-based and taxes MOTOR FUEL. DEF (urea) is an emissions
      -- consumable, not a motor fuel, and is not reportable as taxable fuel — it was previously
      -- included because this file never consulted fuel_type at all (measured: 178 DEF rows /
      -- 1,105.75 gallons, and five jurisdictions — KY, PA, CO, IA, OH — appeared on the return
      -- with DEF gallons ONLY and no taxable fuel at all). Excluded here by fuel_type, which the
      -- codebase already classifies (accounting/fuel-posting/poster.service.ts FUEL_CATEGORY_CODES
      -- and mapFuelTypeToPostingKind both already know 'def').
      --
      -- reefer_diesel is EXCLUDED pending a documented per-row determination (315.14 gallons):
      -- fuel burned in a separate refrigeration unit is not taxable highway fuel, while reefer
      -- diesel drawn from the tractor's own tank is. Excluding it understates rather than
      -- overstates the tax base, which is the safe direction to hold while the receipts are read.
      -- Tracked as IFTA-GALLONS-02; do not silently fold it in.
      WITH scoped AS (
        SELECT
          UPPER(COALESCE(NULLIF(TRIM(location_state), ''), 'UNKNOWN')) AS state,
          COALESCE(gallons, 0)::numeric AS gallons,
          CASE
            WHEN source IN ('wex', 'efs', 'comdata', 'import')
                 AND COALESCE(transaction_reference, '') ILIKE '%relay%' THEN 'relay'
            WHEN source = 'import' THEN 'loves'
            ELSE 'dispatch'
          END AS source_kind
        FROM fuel.fuel_transactions
        WHERE operating_company_id = $1::uuid
          AND archived_at IS NULL
          AND purchased_at >= $2::date
          AND purchased_at < $3::date
          AND LOWER(COALESCE(fuel_type, '')) IN ('diesel', 'gas')
      )
      SELECT
        state,
        SUM(gallons)::numeric(12, 3) AS gallons,
        source_kind,
        COUNT(*)::text AS record_count
      FROM scoped
      GROUP BY state, source_kind
      HAVING SUM(gallons) > 0
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
