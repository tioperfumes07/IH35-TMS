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
