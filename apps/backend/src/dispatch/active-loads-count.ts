/**
 * Dispatch load KPI status sets (Block B7).
 * @see docs/specs/KPI_SOURCES_OF_TRUTH.md
 *
 * ROUND 36.1 (Lead ruling, 2026-09-22, docs/manuals/02-RULING-LIVE-LOADS-VIEW-THE-PERMANENT-FIX.md):
 * every count here now reads FROM views.live_loads instead of mdata.loads directly.
 * ROUND 31.2's own fix (assertCanonicalSubset on these status lists) was necessary but not
 * sufficient — a status-list guard can only prove the STATUS half is a canonical subset; it cannot
 * enforce the MONEY half (a set of NOT EXISTS conditions against three other tables). Thirteen
 * callers imported assertCanonicalSubset, passed it, and still rendered settled loads. The
 * guarantee now lives in the view itself (db/migrations/202614180000_views_live_loads.sql):
 * settled loads are never in views.live_loads at all, for ANY consumer. These status lists stay —
 * they still narrow WITHIN the view's own open_dispatch/pre_settlement buckets, per canonical-
 * active-load-set.ts's A4 (DSP-KPI-ON-LOAD, owner ruling 2026-09-09: "a truck actually has a load
 * out right now" is a narrower question than "is this load active").
 */
import { assertCanonicalSubset } from "./canonical-active-load-set.js";

export const DISPATCH_ACTIVE_LOAD_STATUSES = [
  "assigned_not_dispatched",
  "dispatched",
  "at_pickup",
  "in_transit",
  "at_delivery",
  "delivered_pending_docs",
] as const;
assertCanonicalSubset("DISPATCH_ACTIVE_LOAD_STATUSES", DISPATCH_ACTIVE_LOAD_STATUSES);

// DSP-KPI-ON-LOAD (owner ruling 2026-09-09): the Dispatch Home "Active loads" tile must count only
// trucks that actually HAVE a load out — assigned/dispatched/picking-up/in-transit/at-delivery.
// A delivered_pending_docs load is DONE moving; with AlwaysTrack docs always in, it belongs to the
// factoring/billing pipeline (its own tile drilling to /dispatch/factoring-queue), NOT the active
// dispatch count. Excluding it here is what makes the tile read "real." This is now EXACTLY
// views.live_loads's own open_dispatch/pre_settlement split: delivered_pending_docs lands in
// pre_settlement, never open_dispatch — the view enforces this boundary structurally, this list
// stays for documentation + for callers still narrowing status text client-side.
export const DISPATCH_ON_LOAD_STATUSES = [
  "assigned_not_dispatched",
  "dispatched",
  "at_pickup",
  "in_transit",
  "at_delivery",
] as const;
assertCanonicalSubset("DISPATCH_ON_LOAD_STATUSES", DISPATCH_ON_LOAD_STATUSES);

/** Movement-phase loads (kanban "In Transit" column). */
export const DISPATCH_IN_TRANSIT_STATUSES = ["at_pickup", "in_transit", "at_delivery"] as const;

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

function statusInClause(statuses: readonly string[]): string {
  return statuses.map((status) => `'${status}'::mdata.load_status_enum`).join(", ");
}

/** Count of views.live_loads rows (live_state='open_dispatch', settled loads structurally absent)
 *  narrowed to the given status subset. Callers pass DISPATCH_ON_LOAD_STATUSES/
 *  DISPATCH_IN_TRANSIT_STATUSES (subsets of open_dispatch's own status set) — never
 *  delivered_pending_docs, which the view classifies pre_settlement and this bucket never contains. */
export async function countDispatchLoadsByStatuses(
  client: Queryable,
  operatingCompanyId: string,
  statuses: readonly string[]
): Promise<number> {
  const res = await client.query<{ count: number }>(
    `
      SELECT count(*)::int AS count
      FROM views.live_loads
      WHERE operating_company_id = $1::uuid
        AND live_state = 'open_dispatch'
        AND status IN (${statusInClause(statuses)})
    `,
    [operatingCompanyId]
  );
  return Number(res.rows[0]?.count ?? 0);
}

/** DSP-KPI-ON-LOAD: trucks with a load currently out (open_dispatch, excludes delivered_pending_docs
 *  by construction — that status is never in the open_dispatch bucket). Same count as
 *  countOnLoadDispatchLoads; kept as a separate name for existing call sites. */
export async function countActiveDispatchLoads(client: Queryable, operatingCompanyId: string): Promise<number> {
  return countDispatchLoadsByStatuses(client, operatingCompanyId, DISPATCH_ON_LOAD_STATUSES);
}

/** DSP-KPI-ON-LOAD: trucks with a load currently out (excludes delivered_pending_docs). */
export async function countOnLoadDispatchLoads(client: Queryable, operatingCompanyId: string): Promise<number> {
  return countDispatchLoadsByStatuses(client, operatingCompanyId, DISPATCH_ON_LOAD_STATUSES);
}

export async function countInTransitDispatchLoads(client: Queryable, operatingCompanyId: string): Promise<number> {
  return countDispatchLoadsByStatuses(client, operatingCompanyId, DISPATCH_IN_TRANSIT_STATUSES);
}

/** DELIVERED — PENDING DOCS tile: views.live_loads's pre_settlement bucket, narrowed to the
 *  specific 'delivered_pending_docs' status (pre_settlement also carries plain 'delivered' and
 *  'completed_docs_received', which are a different stage of the same pipeline, not this tile). */
export async function countDeliveredPendingDocsLoads(client: Queryable, operatingCompanyId: string): Promise<number> {
  const res = await client.query<{ count: number }>(
    `
      SELECT count(*)::int AS count
      FROM views.live_loads
      WHERE operating_company_id = $1::uuid
        AND live_state = 'pre_settlement'
        AND status = 'delivered_pending_docs'::mdata.load_status_enum
    `,
    [operatingCompanyId]
  );
  return Number(res.rows[0]?.count ?? 0);
}

export type OpenLoadsBreakdown = {
  total: number;
  in_transit: number;
  assigned: number;
  unassigned: number;
};

/**
 * Home "OPEN LOADS" tile breakdown. ROUND 36.1: reads views.live_loads's open_dispatch bucket
 * only — "OPEN LOADS" and Dispatch board's "ACTIVE LOADS" tile must now render the SAME number
 * (the owner's own acceptance criterion: "a load must render equally across all tabs and
 * functions"), so this no longer separately includes delivered_pending_docs (that is the
 * DELIVERED — PENDING DOCS tile's own pre_settlement count, never folded into "open"). The three
 * sub-buckets are mutually exclusive and sum to total. Excludes soft-deleted loads (the view
 * already does; kept here as belt-and-suspenders documentation, not a second filter).
 *  - in_transit  = movement-phase (at_pickup / in_transit / at_delivery)
 *  - assigned    = open_dispatch, has a primary driver, not yet moving
 *  - unassigned  = open_dispatch, no primary driver yet
 */
export async function getOpenLoadsBreakdown(
  client: Queryable,
  operatingCompanyId: string
): Promise<OpenLoadsBreakdown> {
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
      FROM views.live_loads
      WHERE operating_company_id = $1::uuid
        AND live_state = 'open_dispatch'
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
