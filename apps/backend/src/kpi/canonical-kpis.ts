/**
 * Canonical KPI computations (P8-AUDIT-KPI-DRIFTS).
 * @see docs/specs/KPI_SOURCES_OF_TRUTH.md
 */

import {
  countActiveDispatchLoads,
  countInTransitDispatchLoads,
  DISPATCH_ACTIVE_LOAD_STATUSES,
  DISPATCH_IN_TRANSIT_STATUSES,
} from "../dispatch/active-loads-count.js";
import { countDriverEscrowKpis } from "../banking/driver-escrow-counts.js";

export {
  countActiveDispatchLoads,
  countInTransitDispatchLoads,
  countDriverEscrowKpis,
  DISPATCH_ACTIVE_LOAD_STATUSES,
  DISPATCH_IN_TRANSIT_STATUSES,
};

export const OPEN_MAINTENANCE_WO_STATUSES = ["open", "in_progress", "waiting_parts"] as const;

export const PENDING_BILL_STATUSES = ["open", "partially_paid"] as const;

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

function statusList(statuses: readonly string[]): string {
  return statuses.map((s) => `'${s}'`).join(", ");
}

/**
 * MAINT-2: the ONE canonical "open work order" WHERE fragment (alias-parameterized) — the open-status set
 * AND not voided. Used by BOTH the KPI counts here and the maintenance WO list route so the KPI open-count
 * == the table open-row count (they diverged before: the KPI had no exclusion, the list had a display_id
 * ILIKE 'DEMO-%' hack). maintenance.work_orders has NO is_sample_data column; demo/test WOs are excluded
 * because they are VOIDED (voided_at IS NULL), the canonical void-not-delete signal — GUARD voided
 * DEMO-WO-001/002 on prod, so this replaces the name-pattern hack with the real void flag.
 */
export function openWorkOrderPredicate(alias = ""): string {
  const a = alias ? `${alias}.` : "";
  return `${a}status IN (${statusList(OPEN_MAINTENANCE_WO_STATUSES)}) AND ${a}voided_at IS NULL`;
}

/** HOME + Maintenance KPI row — same filter as maintenance dashboard open_wos. */
export async function countOpenMaintenanceWorkOrders(client: Queryable, operatingCompanyId: string): Promise<number> {
  const res = await client.query<{ count: number }>(
    `
      SELECT count(*)::int AS count
      FROM maintenance.work_orders
      WHERE operating_company_id = $1::uuid
        AND ${openWorkOrderPredicate()}
    `,
    [operatingCompanyId]
  );
  return Number(res.rows[0]?.count ?? 0);
}

/** Open WOs for ONE unit — the retire/sell gate (WF-064). Reuses the canonical open-WO predicate. */
export async function countOpenWorkOrdersForUnit(client: Queryable, unitId: string): Promise<number> {
  const res = await client.query<{ count: number }>(
    `
      SELECT count(*)::int AS count
      FROM maintenance.work_orders
      WHERE unit_id = $1::uuid
        AND ${openWorkOrderPredicate()}
    `,
    [unitId]
  );
  return Number(res.rows[0]?.count ?? 0);
}

/** PM alerts due (open or acknowledged) — Maintenance "PM Due" tile. */
export async function countPmDueAlerts(client: Queryable, operatingCompanyId: string): Promise<number> {
  const res = await client.query<{ count: number }>(
    `
      SELECT count(*)::int AS count
      FROM maintenance.pm_alerts
      WHERE operating_company_id = $1::uuid
        AND state IN ('open', 'acknowledged')
    `,
    [operatingCompanyId]
  );
  return Number(res.rows[0]?.count ?? 0);
}

/** Work orders past due date — Maintenance "Past Due" + Home/Reports maint_past_due. */
export async function countPastDueMaintenanceWorkOrders(client: Queryable, operatingCompanyId: string): Promise<number> {
  const res = await client.query<{ count: number }>(
    `
      SELECT count(*)::int AS count
      FROM maintenance.work_orders w
      WHERE w.operating_company_id = $1::uuid
        AND w.status NOT IN ('complete', 'cancelled', 'completed')
        AND w.due_date IS NOT NULL
        AND w.due_date < CURRENT_DATE
    `,
    [operatingCompanyId]
  );
  return Number(res.rows[0]?.count ?? 0);
}

/** Distinct primary drivers on canonical active dispatch loads (Home "Assigned / Working"). */
export async function countDriversOnActiveLoads(client: Queryable, operatingCompanyId: string): Promise<number> {
  const res = await client.query<{ count: number }>(
    `
      SELECT count(DISTINCT assigned_primary_driver_id)::int AS count
      FROM mdata.loads
      WHERE operating_company_id = $1::uuid
        AND soft_deleted_at IS NULL
        AND assigned_primary_driver_id IS NOT NULL
        AND status::text IN (${statusList(DISPATCH_ACTIVE_LOAD_STATUSES)})
    `,
    [operatingCompanyId]
  );
  return Number(res.rows[0]?.count ?? 0);
}

/** Banking pending bills tile. */
export async function countPendingBills(client: Queryable, operatingCompanyId: string): Promise<number> {
  const res = await client.query<{ count: number }>(
    `
      SELECT count(*)::int AS count
      FROM accounting.bills
      WHERE operating_company_id = $1::uuid
        AND status IN (${statusList(PENDING_BILL_STATUSES)})
    `,
    [operatingCompanyId]
  );
  return Number(res.rows[0]?.count ?? 0);
}
