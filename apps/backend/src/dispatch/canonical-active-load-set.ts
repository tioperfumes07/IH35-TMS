/**
 * Adapter to THE canonical active-load definition in views.live_loads.
 *
 * ROUND 115.3/115.4 (Lead ruling, 2026-09-23) supersedes the status-first and
 * "any money row closes the load" prose that originally lived here. Membership is structural
 * in the view and a load leaves only when BOTH customer money and driver money are closed.
 * Status only excludes never-had-money terminal states and labels open_dispatch/pre_settlement.
 * No TypeScript helper may restate the row-level SQL.
 *
 * Historical context — ROUND 32.2-CORRECTED (Lead ruling, 2026-09-22/23,
 * superseding ROUND 31.2's own §A; docs/bus/09-23-2026-LEAD-RULING-LOAD-ACTIVE-SET-NO-CANONICAL-
 * DEFINITION.md + the CORRECTED follow-up). Owner, verbatim, on the corrected number: "why are
 * there all these units dispatched, when there are only 5, that was supposed to have been
 * resolved already, as all loads that have been reconciled, and all settlements created, and all
 * expenses, all bills, bill payments, and every single transaction related to a load and
 * settlement." That incident is retained as history only; membership now comes exclusively
 * from views.live_loads and its both-money-sides-closed contract.
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
 * status. The first correction then swung too far: it closed membership when EITHER customer or
 * driver money existed. That hid invoiced-but-unsettled costs. `views.live_loads` now owns the
 * both-sides-closed predicate. `canonicalActiveLoadInvoiceExclusionCte` remains only for callers
 * asking the narrower invoice-only question, never active membership.
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

/**
 * "Delivered by status" — Cursor's I2 finding (docs/bus/OUTBOX-CURSOR.md, "I2 does not key on
 * status: a status list near mdata.loads is an eleventh load-status definition. If 'delivered'
 * by status is wanted, it belongs in dispatch/canonical-active-load-set.ts and I2 imports it.").
 * He was right to refuse to invent his own — this is that ONE place, per the file's own law.
 *
 * This answers a DIFFERENT question than CANONICAL_ACTIVE_LOAD_STATUSES and the row-level view
 * above ("is this load still open on the dispatch board"). This
 * is "has this load's status progressed at least as far as delivery" — a delivery-lifecycle
 * stage, not an activity state. The two sets deliberately overlap and diverge: 'closed' is
 * terminal (not board-active) but is also DELIVERED-OR-LATER (a load cannot close without having
 * delivered first); 'dispatched'/'at_pickup'/'in_transit' are board-active but NOT
 * delivered-or-later. Do not merge these into one list — that would be the exact "status alone is
 * not sufficient" trap this file's own header warns about, just inverted.
 *
 * NEVER used to decide whether a load IS delivered on its own (the same "status is stale in both
 * directions on fed data" warning above applies here too) — only to flag the CONTRADICTION when
 * status claims delivery-or-later but neither an issued invoice nor real delivery evidence
 * (Faro purchase / stop departure / manual authorization) exists. See I2
 * (reconciler/invariants/i2-delivered-load-invoiced.ts) for the live consumer.
 */
export const DELIVERED_OR_LATER_STATUSES = [
  "delivered",
  "delivered_pending_docs",
  "completed_docs_received",
  "invoiced",
  "paid",
  "closed",
] as const;

export type DeliveredOrLaterStatus = (typeof DELIVERED_OR_LATER_STATUSES)[number];

/** True when `status` reads as at-or-past delivery — see DELIVERED_OR_LATER_STATUSES above for
 *  what this does and does not mean. */
export function isDeliveredOrLaterStatus(status: string): boolean {
  return (DELIVERED_OR_LATER_STATUSES as readonly string[]).includes(status);
}

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

/**
 * Invoice-only exclusion — the narrower, ROUND-31.2 signal. Kept as a component (some callers
 * genuinely only care about the invoice half), but on its own it cannot decide active membership.
 * Use `canonicalActiveLoadWhereClause` for the structural view membership. `loadIdColumn` names the
 * column carrying the load's id in the caller's own FROM clause (aliased to match).
 */
export function issuedCustomerInvoiceExistsSql(
  loadIdColumn = "l.id",
  operatingCompanyIdColumn = "l.operating_company_id"
): string {
  return `
    EXISTS (
      SELECT 1 FROM accounting.invoices i
       WHERE i.source_load_id = ${loadIdColumn}
         AND i.operating_company_id = ${operatingCompanyIdColumn}
         AND i.voided_at IS NULL
         AND i.status NOT IN ('draft', 'proforma', 'void')
    )
  `;
}

export function canonicalActiveLoadInvoiceExclusionCte(
  loadIdColumn = "l.id",
  operatingCompanyIdColumn = "l.operating_company_id"
): string {
  return `NOT (${issuedCustomerInvoiceExistsSql(loadIdColumn, operatingCompanyIdColumn)})`;
}

/**
 * The complete canonical predicate is membership in views.live_loads.
 *
 * ROUND 115 closes the last split-brain definition: the SQL view is the structural source of
 * truth and this helper is only its aliasable adapter for queries that must retain a richer FROM
 * source. Never restate the status/money clauses here; doing so previously disagreed with the
 * corrected pre-settlement rule (an issued invoice does not close an unsettled round trip).
 */
export function canonicalActiveLoadWhereClause(alias = "l"): string {
  return `EXISTS (SELECT 1 FROM views.live_loads canonical_live_load WHERE canonical_live_load.id = ${alias}.id)`;
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
      FROM views.live_loads l
      WHERE l.operating_company_id = $1::uuid
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
      FROM views.live_loads l
      WHERE l.operating_company_id = $1::uuid
    `,
    [operatingCompanyId]
  );
  return res.rows.map((r) => r.id);
}
