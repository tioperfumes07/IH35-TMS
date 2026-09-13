// ROUND 23.3 B5 (owner, 2026-09-13, verbatim, AUTHORIZING a new write path after the original "no
// new write path" brief proved unworkable): "one primitive that moves a load with its bills,
// settlement lines, deductions, reimbursements and attribution links together in one transaction,
// or nothing moves."
//
// WHY THIS IS NEW GROUND (researched live, this session, before writing a line of this file):
// there is NO existing code path anywhere in this repo that detaches a load's settlement-side
// records from one driver_finance.driver_settlements row and re-homes them onto another.
// confirmPresettlementLink (dispatch/presettlement-link.service.ts) only ever ADDS a load to a
// settlement (create_new / link_existing); linkLoadToPresettlementAfterAssignmentInClientTx
// explicitly NO-OPS when a load already carries a presettlement_link_id, and its own comment says
// re-linking an already-linked load "is a separate vehicle-swap/settlement-lines concern, not this
// function's job" -- this file is that concern, built now that the owner has authorized it.
//
// WHAT ACTUALLY MOVES (confirmed live via information_schema + migration grep, not assumed):
//   mdata.loads.presettlement_link_id                              -- the canonical load->settlement pointer
//   driver_finance.settlement_lines.settlement_id (WHERE load_id=X)-- the money: earnings/deductions/
//                                                                      reimbursements/deadhead_pay/etc lines
//   driver_finance.driver_settlement_deductions.applied_to_settlement_id (WHERE load_id=X, if set)
//   driver_finance.driver_reimbursements.applied_to_settlement_id (WHERE load_id=X, if set)
//   driver_finance.driver_bills.settled_in_settlement_id (WHERE load_id=X)
//     -- LEGACY/secondary pointer (settlements.routes.ts's own comment: "Never use
//        driver_bills.settled_in_settlement_id [for settlement identity]... the real settlement is
//        assigned into driver_finance.settlement_lines"). Synced here anyway because B6 (this
//        session) already populated it from current state and the owner's own wording ("the
//        primitive carries the links when it moves them") names it explicitly -- kept in sync, not
//        treated as canonical.
//
// WHAT DOES NOT MOVE (disclosed, not silently skipped): expense_attribution.expense_load_links has
// NO settlement column at all (confirmed live) -- it is keyed to load_id only and is already correct
// regardless of which settlement the load belongs to. The owner's "attribution links" phrase is
// satisfied by inaction here, not oversight.
//
// THE BOOKEND GAP (found in research, fixed here): aggregateSettlementTotals's first_load_id/
// last_load_id backfill is COALESCE-only-fills-NULL -- it will never CLEAR a stale bookend on the
// settlement a load is being REMOVED from. This primitive explicitly NULLs out first_load_id/
// last_load_id on the source settlement when they point at the moving load, before recomputing, so
// aggregateSettlementTotals can honestly re-derive them from what's left.
//
// NO NEW GL MATH: net_pay/gross_pay/deductions_total/reimbursements_total are recomputed by calling
// the existing, canonical aggregateSettlementTotals() on both settlements afterward -- this file
// authors zero dollar math of its own.
import { appendCrudAudit } from "../audit/crud-audit.js";
import { allocateSettlementDisplayId } from "./settlement-display-id.js";
import { setSettlementSourceDocumentRef } from "./settlement-source-document-ref.service.js";
import { aggregateSettlementTotals } from "./settlements-load-bookended.service.js";

export type DbClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number | null }>;
};

export class SettlementReassignmentError extends Error {
  constructor(
    readonly code: string,
    message?: string
  ) {
    super(message ?? code);
    this.name = "SettlementReassignmentError";
  }
}

export type CreateBareSettlementInput = {
  operating_company_id: string;
  driver_id: string;
  period_start: string; // YYYY-MM-DD, the tour's own start date -- never invented
  period_end: string; // YYYY-MM-DD, the tour's own close date
  source_document_ref: string; // the real AlwaysTrack signed number, e.g. "5786"
  actor_user_id: string;
  is_sample_data: boolean;
  // BRANCH-REHEARSAL FINDING (this session): driver_finance.driver_settlements has
  // uq_driver_settlements_one_open_per_driver -- at most ONE 'open' settlement per
  // (operating_company_id, driver_id). A B5 re-cut settlement represents an ALREADY-SIGNED,
  // ALREADY-CLOSED AlwaysTrack document, never a currently-active tour, so 'open' is the wrong
  // default and collides with whatever real open tour that driver has today (reproduced live:
  // duplicate key on this exact constraint on the very first rehearsal run). Callers creating a
  // re-cut settlement for a closed historical document MUST pass 'closed' (or another non-'open'
  // status); 'open' stays available for the rare case of genuinely re-creating a still-active tour.
  status: "closed" | "locked" | "cancelled" | "open";
};

/**
 * Mints a brand-new, empty driver_settlements row for a re-cut target document, reusing the SAME
 * display-id allocator and source_document_ref setter this codebase already has (no new numbering
 * logic authored here). Does NOT touch any load -- reassignLoadToSettlementInClientTx below is what
 * populates it.
 */
export async function createBareSettlementForDocument(
  client: DbClient,
  input: CreateBareSettlementInput
): Promise<{ settlement_id: string; display_id: string }> {
  const displayId = await allocateSettlementDisplayId(client, input.operating_company_id, input.period_start);
  const insertRes = await client.query<{ id: string }>(
    `
      INSERT INTO driver_finance.driver_settlements (
        operating_company_id, driver_id, status, display_id, period_start, period_end,
        trip_started_at, trip_closed_at, settlement_model, created_by_user_id, is_sample_data
      )
      VALUES ($1::uuid, $2::uuid, $8, $3, $4::date, $5::date, $4::date,
              CASE WHEN $8 = 'open' THEN NULL ELSE $5::date END, 'load_bookended', $6::uuid, $7)
      RETURNING id
    `,
    [input.operating_company_id, input.driver_id, displayId, input.period_start, input.period_end, input.actor_user_id, input.is_sample_data, input.status]
  );
  const settlementId = insertRes.rows[0]!.id;

  const refResult = await setSettlementSourceDocumentRef(client, {
    operatingCompanyId: input.operating_company_id,
    settlementId,
    sourceDocumentRef: input.source_document_ref,
    actorUserId: input.actor_user_id,
  });
  if (!refResult) {
    throw new SettlementReassignmentError(
      "source_document_ref_set_failed",
      `setSettlementSourceDocumentRef returned no match for the settlement it just created (${settlementId})`
    );
  }

  await appendCrudAudit(
    client,
    input.actor_user_id,
    "driver_finance.settlement.created_for_recut",
    { settlement_id: settlementId, display_id: displayId, source_document_ref: input.source_document_ref },
    "info",
    "BANK-F30160-B5"
  );

  return { settlement_id: settlementId, display_id: displayId };
}

export type ReassignLoadInput = {
  operating_company_id: string;
  load_id: string;
  target_settlement_id: string;
  actor_user_id: string;
  reason: string;
};

export type ReassignLoadResult =
  | {
      kind: "ok";
      from_settlement_id: string | null;
      to_settlement_id: string;
      moved_settlement_lines: number;
      moved_deductions: number;
      moved_reimbursements: number;
      moved_bills: number;
      from_recompute_method: RecomputeMethod | null;
      to_recompute_method: RecomputeMethod;
    }
  | { kind: "load_not_found" }
  | { kind: "target_settlement_not_found" }
  | { kind: "already_on_target" };

export type RecomputeMethod = "settlement_lines" | "driver_bills_direct";

/**
 * BRANCH-REHEARSAL FINDING (this session, before any prod write): live measurement across all 245
 * USMCA driver_finance.driver_settlements rows found 100% of 'cancelled' (23/23) and 100% of 'open'
 * (7/7) settlements, plus 6 of 44 'closed' ones, carry ZERO active (`is_active=true`)
 * settlement_lines rows -- their gross_pay/deductions_total/net_pay header was never derived from
 * settlement_lines at all. Cross-checked one live example (settlement dac3e8ac, $1,607.45 stored
 * net_pay, 19/19 lines inactive): its stored gross_pay ($1,852.45) exactly equals the sum of its
 * NON-VOID driver_bills.gross_amount_cents, and net_pay exactly equals that minus its applied
 * driver_settlement_deductions -- proving the header was written by
 * settlement-bill-payment-posting.service.ts's poster (which computes gross/deductions directly
 * from driver_bills, bypassing settlement_lines entirely), not by aggregateSettlementTotals.
 *
 * Calling aggregateSettlementTotals unconditionally on a settlement in this state would silently
 * ZERO OUT a real, currently-correct net_pay -- exactly the kind of prod-corrupting mistake
 * "rehearse on a Neon branch now" exists to catch before it reaches prod. This function checks
 * which model actually produced the CURRENT header before choosing how to recompute it:
 *   - has active settlement_lines -> aggregateSettlementTotals (the one existing canonical rollup,
 *     no new GL math).
 *   - has none -> reproduce the SAME read-only formula settlement-bill-payment-posting.service.ts's
 *     poster uses (sum of non-void driver_bills.gross_amount_cents for bills currently
 *     settled_in_settlement_id = this settlement, minus non-voided driver_settlement_deductions
 *     applied to it, plus non-voided driver_reimbursements applied to it) WITHOUT that poster's GL-
 *     posting side effects (no bill_payment, no journal entry) -- a pure header-only mirror of an
 *     already-existing formula, not new GL math.
 */
export async function recomputeSettlementHeader(
  client: DbClient,
  settlementId: string,
  operatingCompanyId: string
): Promise<{ method: RecomputeMethod }> {
  const activeLinesRes = await client.query<{ n: string }>(
    `SELECT count(*) AS n FROM driver_finance.settlement_lines
      WHERE settlement_id = $1::uuid AND operating_company_id = $2::uuid AND is_active`,
    [settlementId, operatingCompanyId]
  );
  if (Number(activeLinesRes.rows[0]!.n) > 0) {
    await aggregateSettlementTotals(client, settlementId, operatingCompanyId);
    return { method: "settlement_lines" };
  }

  const totalsRes = await client.query<{ gross_cents: string; deductions_cents: string; reimbursements_cents: string }>(
    `
      SELECT
        COALESCE((
          SELECT sum(db.gross_amount_cents) FROM driver_finance.driver_bills db
           WHERE db.settled_in_settlement_id = $1::uuid AND db.operating_company_id = $2::uuid
             AND db.voided_at IS NULL AND db.status <> 'void'
        ), 0) AS gross_cents,
        COALESCE((
          SELECT sum(dd.amount_cents) FROM driver_finance.driver_settlement_deductions dd
           WHERE dd.applied_to_settlement_id = $1::uuid AND dd.operating_company_id = $2::uuid
             AND dd.voided_at IS NULL
        ), 0) AS deductions_cents,
        COALESCE((
          SELECT sum(dr.amount_cents) FROM driver_finance.driver_reimbursements dr
           WHERE dr.applied_to_settlement_id = $1::uuid AND dr.operating_company_id = $2::uuid
             AND dr.voided_at IS NULL
        ), 0) AS reimbursements_cents
    `,
    [settlementId, operatingCompanyId]
  );
  const gross = Number(totalsRes.rows[0]!.gross_cents);
  const deductions = Number(totalsRes.rows[0]!.deductions_cents);
  const reimbursements = Number(totalsRes.rows[0]!.reimbursements_cents);
  const net = gross - deductions + reimbursements;
  await client.query(
    `UPDATE driver_finance.driver_settlements
        SET gross_pay = $2::numeric, deductions_total = $3::numeric, reimbursements_total = $4::numeric,
            net_pay = $5::numeric, updated_at = now()
      WHERE id = $1::uuid AND operating_company_id = $6::uuid`,
    [settlementId, (gross / 100).toFixed(2), (deductions / 100).toFixed(2), (reimbursements / 100).toFixed(2), (net / 100).toFixed(2), operatingCompanyId]
  );
  return { method: "driver_bills_direct" };
}

/**
 * THE primitive. Moves one load's settlement-side records from whatever settlement it is
 * currently on (if any) onto `target_settlement_id`, atomically. Caller owns the transaction
 * (BEGIN/COMMIT) -- this function does not open one itself, matching every other *InClientTx
 * helper in this codebase (e.g. reversePostedSourceTransactionInClientTx). A thrown error here
 * must roll back the caller's whole transaction: "or nothing moves."
 */
export async function reassignLoadToSettlementInClientTx(
  client: DbClient,
  input: ReassignLoadInput
): Promise<ReassignLoadResult> {
  const loadRes = await client.query<{ presettlement_link_id: string | null }>(
    `SELECT presettlement_link_id FROM mdata.loads WHERE id = $1::uuid AND operating_company_id = $2::uuid FOR UPDATE`,
    [input.load_id, input.operating_company_id]
  );
  const load = loadRes.rows[0];
  if (!load) return { kind: "load_not_found" };

  const targetRes = await client.query<{ id: string }>(
    `SELECT id FROM driver_finance.driver_settlements WHERE id = $1::uuid AND operating_company_id = $2::uuid FOR UPDATE`,
    [input.target_settlement_id, input.operating_company_id]
  );
  if (!targetRes.rows[0]) return { kind: "target_settlement_not_found" };

  const fromSettlementId = load.presettlement_link_id;
  if (fromSettlementId === input.target_settlement_id) return { kind: "already_on_target" };

  // 1. the canonical pointer.
  await client.query(`UPDATE mdata.loads SET presettlement_link_id = $1::uuid, updated_at = now() WHERE id = $2::uuid`, [
    input.target_settlement_id,
    input.load_id,
  ]);

  // 2. the money: settlement_lines re-homed to the target settlement. Only rows that were on
  // the SOURCE settlement move -- a line with a NULL settlement_id can't exist (NOT NULL column),
  // so `fromSettlementId` being null means there is nothing to move at this level yet (the load
  // was never linked, e.g. one of the 5 driver-bill-only loads found this session).
  let movedLines = 0;
  if (fromSettlementId) {
    const linesRes = await client.query(
      `UPDATE driver_finance.settlement_lines SET settlement_id = $1::uuid, updated_at = now()
        WHERE load_id = $2::uuid AND settlement_id = $3::uuid AND operating_company_id = $4::uuid`,
      [input.target_settlement_id, input.load_id, fromSettlementId, input.operating_company_id]
    );
    movedLines = linesRes.rowCount ?? 0;
  }

  // 3. deductions applied to the source settlement for this load.
  let movedDeductions = 0;
  if (fromSettlementId) {
    const dedRes = await client.query(
      `UPDATE driver_finance.driver_settlement_deductions SET applied_to_settlement_id = $1::uuid, updated_at = now()
        WHERE load_id = $2::uuid AND applied_to_settlement_id = $3::uuid AND operating_company_id = $4::uuid`,
      [input.target_settlement_id, input.load_id, fromSettlementId, input.operating_company_id]
    );
    movedDeductions = dedRes.rowCount ?? 0;
  }

  // 4. reimbursements applied to the source settlement for this load. settlement_line_id (if set)
  // stays valid without a separate rewrite -- step 2 updated the SAME settlement_lines row in place
  // (its id is unchanged), it only re-homed which settlement that row now belongs to.
  let movedReimbursements = 0;
  if (fromSettlementId) {
    const reimbRes = await client.query(
      `UPDATE driver_finance.driver_reimbursements SET applied_to_settlement_id = $1::uuid, updated_at = now()
        WHERE load_id = $2::uuid AND applied_to_settlement_id = $3::uuid AND operating_company_id = $4::uuid`,
      [input.target_settlement_id, input.load_id, fromSettlementId, input.operating_company_id]
    );
    movedReimbursements = reimbRes.rowCount ?? 0;
  }

  // 5. legacy driver_bills pointer -- kept in sync per the owner's explicit wording, not treated as
  // canonical (see file header). Covers both "was stamped to the source settlement" and "was never
  // stamped at all" (NULL) -- the latter is exactly B6's 5 remaining loads once they get a target.
  const billsRes = await client.query(
    `UPDATE driver_finance.driver_bills SET settled_in_settlement_id = $1::uuid, updated_at = now()
      WHERE load_id = $2::uuid AND operating_company_id = $3::uuid AND voided_at IS NULL
        AND (settled_in_settlement_id = $4::uuid OR settled_in_settlement_id IS NULL)`,
    [input.target_settlement_id, input.load_id, input.operating_company_id, fromSettlementId]
  );
  const movedBills = billsRes.rowCount ?? 0;

  // 6. THE BOOKEND GAP FIX (see file header) -- clear the source settlement's first/last_load_id
  // if either one names the load that just moved, so aggregateSettlementTotals's COALESCE-only-
  // fills-NULL bookend backfill can honestly re-derive them from whatever loads remain.
  if (fromSettlementId) {
    await client.query(
      `UPDATE driver_finance.driver_settlements
          SET first_load_id = CASE WHEN first_load_id = $2::uuid THEN NULL ELSE first_load_id END,
              first_load_number = CASE WHEN first_load_id = $2::uuid THEN NULL ELSE first_load_number END,
              last_load_id = CASE WHEN last_load_id = $2::uuid THEN NULL ELSE last_load_id END,
              last_load_number = CASE WHEN last_load_id = $2::uuid THEN NULL ELSE last_load_number END,
              updated_at = now()
        WHERE id = $1::uuid AND operating_company_id = $3::uuid`,
      [fromSettlementId, input.load_id, input.operating_company_id]
    );
  }

  // 7. recompute headers -- see recomputeSettlementHeader's own header comment for why this is
  // NOT a blind call to aggregateSettlementTotals.
  let fromRecomputeMethod: RecomputeMethod | null = null;
  if (fromSettlementId) {
    fromRecomputeMethod = (await recomputeSettlementHeader(client, fromSettlementId, input.operating_company_id)).method;
  }
  const toRecomputeMethod = (await recomputeSettlementHeader(client, input.target_settlement_id, input.operating_company_id)).method;

  await appendCrudAudit(
    client,
    input.actor_user_id,
    "driver_finance.load.reassigned_to_settlement",
    {
      load_id: input.load_id,
      from_settlement_id: fromSettlementId,
      to_settlement_id: input.target_settlement_id,
      reason: input.reason,
      moved_settlement_lines: movedLines,
      moved_deductions: movedDeductions,
      moved_reimbursements: movedReimbursements,
      moved_bills: movedBills,
      from_recompute_method: fromRecomputeMethod,
      to_recompute_method: toRecomputeMethod,
    },
    "warning",
    "BANK-F30160-B5"
  );

  return {
    kind: "ok",
    from_settlement_id: fromSettlementId,
    to_settlement_id: input.target_settlement_id,
    moved_settlement_lines: movedLines,
    moved_deductions: movedDeductions,
    moved_reimbursements: movedReimbursements,
    moved_bills: movedBills,
    from_recompute_method: fromRecomputeMethod,
    to_recompute_method: toRecomputeMethod,
  };
}
