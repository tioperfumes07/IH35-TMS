/**
 * THE canonical "active load" definition — ROUND 32.2-CORRECTED (Lead ruling, 2026-09-22/23,
 * superseding ROUND 31.2's own §A; docs/bus/09-23-2026-LEAD-RULING-LOAD-ACTIVE-SET-NO-CANONICAL-
 * DEFINITION.md + the CORRECTED follow-up). Owner, verbatim, on the corrected number: "why are
 * there all these units dispatched, when there are only 5, that was supposed to have been
 * resolved already, as all loads that have been reconciled, and all settlements created, and all
 * expenses, all bills, bill payments, and every single transaction related to a load and
 * settlement." He was right and exact — the true count is 9 loads / 5 units, not 33.
 *
 * Before this file, TEN different places declared their own "active load" status list, returning
 * FIVE different counts against the same 126 live USMCA loads (116 / 114 / 33 / 22 / 19). This is
 * the ONE canonical definition. Every consumer imports it — never re-declare a status list or
 * inline a `status NOT IN (...)` gate on `mdata.loads` outside this file
 * (enforced by scripts/verify-one-canonical-active-load-set.mjs).
 *
 * STATUS ALONE IS NOT SUFFICIENT, TWICE OVER — two separate, independently-discovered gaps:
 *
 * (A3, ROUND 31.2) load-costs-board.routes.ts already computed "does this load carry a real
 * (non-draft/proforma/void) invoice" at its own `invoice_info` CTE and never applied that signal
 * to its outer WHERE. Fixed — but invoice-exclusion ALONE still overcounted (114 -> 33), because:
 *
 * (ROUND 32.2-CORRECTED) on this fed data, money moved on 24 of those 33 loads WITHOUT
 * mdata.loads.status ever advancing: settlements were created, driver bills raised, expenses
 * posted — and status still reads 'dispatched'/'delivered'. NONE of those 24 was ever invoiced,
 * so the invoice-exclusion test missed every one of them. **The money is the source of truth, not
 * status.** `canonicalActiveLoadNotFinishedByMoneyCte` below is the real second half of the
 * invariant — NOT EXISTS an active settlement line, a non-void driver bill, OR an issued invoice
 * for this load. Both halves — status IN canonical AND NOT finished-by-money — must gate
 * together; a board applying status alone, or status + invoice-only, is WRONG and will overcount.
 * `canonicalActiveLoadInvoiceExclusionCte` (invoice-only) is kept below as the narrower signal it
 * always was — a component of the real predicate, not the real predicate itself anymore.
 *
 * This is confirmed live, not asserted: 9 truly-open loads (13609, 13610, 13612, 13613, 13614,
 * 13615, 13616, 13617, 13618) across 5 distinct units — the owner's own 5. Do NOT hard-code 9, 5,
 * or any load/unit number anywhere — they move the moment real dispatch happens today.
 *
 * THE 24 STALE-STATUS LOADS ARE A SEPARATE, REAL DATA DEFECT, NOT PATCHED HERE (ROUND 32.2-
 * CORRECTED §E): this predicate makes every board correct TODAY without touching a row — it does
 * NOT fix why the settlement path never advances mdata.loads.status. That is a write-path defect
 * (same family as the already-found invoices.routes.ts:1122-1148 void-without-status-revert gap)
 * for its own dedicated PR, never a mass status UPDATE. The predicate in this file stays
 * permanently even after that write-path is fixed — status has now proven stale in both
 * directions and is never trusted alone again.
 *
 * KEEP at_pickup / in_transit / at_delivery / assigned_not_dispatched / booked / planned /
 * assigned / unassigned / completed_docs_received / abandoned / driver_walkoff / driver_no_show
 * in the canonical STATUS set even though several read ZERO rows today. RESOLVED, do not re-open:
 * the owner states every existing load was FED, not created in the app; nothing has walked the
 * full lifecycle in-app yet, and dispatching starts today. Dropping a zero-row status hides the
 * first real load the owner books.
 *
 * NARROWER named views STAY (A4) — they ask a genuinely different question than "is this load
 * active" — but must be declared as a SUBSET of the canonical STATUS set, never independently:
 *   - DISPATCH_ON_LOAD_STATUSES (apps/backend/src/dispatch/active-loads-count.ts) — DSP-KPI-ON-LOAD
 *     (owner ruling 2026-09-09): "a truck actually has a load out right now," narrower than active.
 *   - fleet-location-hos.service.ts's own set — CC-3's objection SUSTAINED: "driver in the truck
 *     right now" is a different question than "is this load active." Stays narrower, untouched
 *     here.
 *   - the in-transit kanban column, the alert queue.
 * `assertCanonicalSubset` below throws at import time if a narrower set ever drifts outside this
 * one — a stale narrower list becoming its OWN eleventh definition is exactly the failure mode
 * this file exists to prevent.
 */

export const CANONICAL_ACTIVE_LOAD_STATUSES = [
  "booked",
  "planned",
  "assigned",
  "unassigned",
  "assigned_not_dispatched",
  "dispatched",
  "at_pickup",
  "in_transit",
  "at_delivery",
  "delivered",
  "delivered_pending_docs",
  "completed_docs_received",
  "abandoned",
  "driver_walkoff",
  "driver_no_show",
] as const;

export type CanonicalActiveLoadStatus = (typeof CANONICAL_ACTIVE_LOAD_STATUSES)[number];

/** The five statuses a load is NOT active in. Named for readability at call sites; the guard and
 *  every query below derive from CANONICAL_ACTIVE_LOAD_STATUSES, not from this list — this is
 *  documentation, not a second source of truth. */
export const CANONICAL_TERMINAL_LOAD_STATUSES = ["draft", "invoiced", "paid", "closed", "cancelled"] as const;

/** Throws if `subset` contains any status outside the canonical active set — call this once at
 *  module load for every narrower named view so drift fails loudly at import time, not silently
 *  in a live count. */
export function assertCanonicalSubset(name: string, subset: readonly string[]): void {
  const allowed = new Set<string>(CANONICAL_ACTIVE_LOAD_STATUSES);
  const outside = subset.filter((s) => !allowed.has(s));
  if (outside.length > 0) {
    throw new Error(
      `${name} declares status(es) outside CANONICAL_ACTIVE_LOAD_STATUSES: ${outside.join(", ")}. ` +
        `Narrower views must be a subset of the canonical active-load set (ROUND 31.2) — fix the ` +
        `narrower list, or if the status genuinely belongs in "active", add it to the canonical ` +
        `set itself (with a written reason) rather than letting a narrower view diverge silently.`
    );
  }
}

function statusInClause(statuses: readonly string[]): string {
  return statuses.map((status) => `'${status}'::mdata.load_status_enum`).join(", ");
}

/** `l.status IN (...)` fragment for the canonical set, aliasable to match the caller's query. */
export function canonicalActiveLoadStatusClause(alias = "l"): string {
  return `${alias}.status IN (${statusInClause(CANONICAL_ACTIVE_LOAD_STATUSES)})`;
}

/**
 * Invoice-only exclusion — the narrower, ROUND-31.2 signal. Kept as a component (some callers
 * genuinely only care about the invoice half), but on its own it UNDERCOUNTS the real "finished"
 * set (missed 24 of 33 on live data, ROUND 32.2-CORRECTED) — use
 * `canonicalActiveLoadNotFinishedByMoneyCte` for the real predicate. `loadIdColumn` names the
 * column carrying the load's id in the caller's own FROM clause (aliased to match).
 */
export function canonicalActiveLoadInvoiceExclusionCte(loadIdColumn = "l.id"): string {
  return `
    NOT EXISTS (
      SELECT 1 FROM accounting.invoices i
       WHERE i.source_load_id = ${loadIdColumn}
         AND i.status NOT IN ('draft', 'proforma', 'void')
    )
  `;
}

/**
 * THE real "not finished" half of the invariant (ROUND 32.2-CORRECTED) — money is the source of
 * truth, not status. A load is finished (and therefore NOT active, regardless of status) the
 * moment ANY of these exist: an active settlement line, a non-void driver bill, or an issued
 * (non-draft/proforma/void) invoice. Confirmed live: 24 of 33 status-active USMCA loads are
 * already settled/driver-billed while status never advanced past dispatched/delivered — status
 * alone (or status + invoice-only) overcounts by exactly that 24. `loadIdColumn` names the
 * column carrying the load's id in the caller's own FROM clause (aliased to match).
 */
export function canonicalActiveLoadNotFinishedByMoneyCte(loadIdColumn = "l.id"): string {
  return `
    NOT EXISTS (
      SELECT 1 FROM driver_finance.settlement_lines sl
       WHERE sl.load_id = ${loadIdColumn} AND sl.is_active IS TRUE
    )
    AND NOT EXISTS (
      SELECT 1 FROM driver_finance.driver_bills db
       WHERE db.load_id = ${loadIdColumn} AND db.status <> 'void'
    )
    AND ${canonicalActiveLoadInvoiceExclusionCte(loadIdColumn)}
  `;
}

/** The complete canonical predicate — status IN canonical AND not-finished-by-money, aliasable.
 *  Every consumer's outer WHERE must include BOTH; applying status alone, or status + the
 *  invoice-only signal, overcounts (confirmed live, ROUND 32.2-CORRECTED). */
export function canonicalActiveLoadWhereClause(alias = "l"): string {
  return `${canonicalActiveLoadStatusClause(alias)} AND ${canonicalActiveLoadNotFinishedByMoneyCte(`${alias}.id`)}`;
}

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

/** Live count of the canonical active-load set for one company — the single source every board,
 *  tile, and KPI consumer should call rather than re-deriving its own query. */
export async function countCanonicalActiveLoads(client: Queryable, operatingCompanyId: string): Promise<number> {
  const res = await client.query<{ count: number }>(
    `
      SELECT count(*)::int AS count
      FROM mdata.loads l
      WHERE l.operating_company_id = $1::uuid
        AND l.soft_deleted_at IS NULL
        AND ${canonicalActiveLoadWhereClause("l")}
    `,
    [operatingCompanyId]
  );
  return Number(res.rows[0]?.count ?? 0);
}

/** The full id list of the canonical active set — for consumers that need to join against it
 *  rather than just count it (boards, pickers, kanban). */
export async function listCanonicalActiveLoadIds(client: Queryable, operatingCompanyId: string): Promise<string[]> {
  const res = await client.query<{ id: string }>(
    `
      SELECT l.id::text AS id
      FROM mdata.loads l
      WHERE l.operating_company_id = $1::uuid
        AND l.soft_deleted_at IS NULL
        AND ${canonicalActiveLoadWhereClause("l")}
    `,
    [operatingCompanyId]
  );
  return res.rows.map((r) => r.id);
}
