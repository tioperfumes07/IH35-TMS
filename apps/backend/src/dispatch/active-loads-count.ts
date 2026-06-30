/**
 * Canonical dispatch load KPI status sets (Block B7).
 * @see docs/specs/KPI_SOURCES_OF_TRUTH.md
 */

export const DISPATCH_ACTIVE_LOAD_STATUSES = [
  "assigned_not_dispatched",
  "dispatched",
  "at_pickup",
  "in_transit",
  "at_delivery",
  "delivered_pending_docs",
] as const;

/** Movement-phase loads (kanban "In Transit" column). */
export const DISPATCH_IN_TRANSIT_STATUSES = ["at_pickup", "in_transit", "at_delivery"] as const;

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

function statusInClause(statuses: readonly string[]): string {
  return statuses.map((status) => `'${status}'::mdata.load_status_enum`).join(", ");
}

export async function countDispatchLoadsByStatuses(
  client: Queryable,
  operatingCompanyId: string,
  statuses: readonly string[]
): Promise<number> {
  const res = await client.query<{ count: number }>(
    `
      SELECT count(*)::int AS count
      FROM mdata.loads
      WHERE operating_company_id = $1
        AND soft_deleted_at IS NULL
        AND status IN (${statusInClause(statuses)})
    `,
    [operatingCompanyId]
  );
  return Number(res.rows[0]?.count ?? 0);
}

export async function countActiveDispatchLoads(client: Queryable, operatingCompanyId: string): Promise<number> {
  return countDispatchLoadsByStatuses(client, operatingCompanyId, DISPATCH_ACTIVE_LOAD_STATUSES);
}

export async function countInTransitDispatchLoads(client: Queryable, operatingCompanyId: string): Promise<number> {
  return countDispatchLoadsByStatuses(client, operatingCompanyId, DISPATCH_IN_TRANSIT_STATUSES);
}

export type OpenLoadsBreakdown = {
  total: number;
  in_transit: number;
  assigned: number;
  unassigned: number;
};

/**
 * Home "OPEN LOADS" tile breakdown. The three sub-buckets are mutually exclusive and sum to total,
 * all within the canonical active set (so in_transit <= total always — addresses HOME-2, where the
 * Home KPI showing 0 contradicted the in-flight-late count). Excludes soft-deleted loads.
 *  - in_transit  = movement-phase (at_pickup / in_transit / at_delivery)
 *  - assigned    = active, has a primary driver, not yet moving
 *  - unassigned  = active, no primary driver yet
 */
export async function getOpenLoadsBreakdown(
  client: Queryable,
  operatingCompanyId: string
): Promise<OpenLoadsBreakdown> {
  const activeIn = statusInClause(DISPATCH_ACTIVE_LOAD_STATUSES);
  const transitIn = statusInClause(DISPATCH_IN_TRANSIT_STATUSES);
  const res = await client.query<{
    total: number;
    in_transit: number;
    assigned: number;
    unassigned: number;
  }>(
    `
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE status IN (${transitIn}))::int AS in_transit,
        count(*) FILTER (WHERE status NOT IN (${transitIn}) AND assigned_primary_driver_id IS NOT NULL)::int AS assigned,
        count(*) FILTER (WHERE status NOT IN (${transitIn}) AND assigned_primary_driver_id IS NULL)::int AS unassigned
      FROM mdata.loads
      WHERE operating_company_id = $1
        AND soft_deleted_at IS NULL
        AND status IN (${activeIn})
    `,
    [operatingCompanyId]
  );
  const row = res.rows[0];
  return {
    total: Number(row?.total ?? 0),
    in_transit: Number(row?.in_transit ?? 0),
    assigned: Number(row?.assigned ?? 0),
    unassigned: Number(row?.unassigned ?? 0),
  };
}
