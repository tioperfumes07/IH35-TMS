// LEAD 443.192 — the ONE driver-settlement void cascade (lines voided, open driver bills + unpaid reimbursements released
// from the dead settlement, registered children). Shared by governance executeVoidCancel('driver_settlement') and
// driver-finance reverseSettlementForVoid. A leaf module (imports only the cascade-void engine) so neither caller pulls
// the other's dependency graph. Never deletes; every write touches only rows still linked/live (idempotent).
// LEAD 443.193: also the ONE deduction rule for a voided settlement (restoreSettlementDeductionsInClientTx — the GL
// reversal's own restore, already in both callers' graph via reverseSettlementBillPaymentInClientTx).
import { cascadeVoidChildren } from "../accounting/cascade-void-engine.service.js";
import { restoreSettlementDeductionsInClientTx } from "../accounting/settlement-posting/settlement-posting.service.js";

type CascadeClient = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

export type DriverSettlementVoidCascadeResult = {
  lines_voided: string[];
  driver_bills_released: string[];
  reimbursements_released: string[];
  /** LEAD 443.193 — nothing_to_reverse only: plain pending deductions released from the dead settlement. */
  deductions_released: string[];
  /** LEAD 443.193 — nothing_to_reverse only: deductions still linked but collected / voided — never touched. */
  deductions_retained: string[];
  children: Awaited<ReturnType<typeof cascadeVoidChildren>>;
  /** LEAD 443.198 — true when this call closed the trip of a load_bookended settlement (trip_closed_at was NULL). */
  trip_closed: boolean;
  /** 443.210R — loads whose presettlement_link_id pointed at this settlement, now cleared so they can join a new one. */
  loads_released: string[];
  /** 443.210R — company settlement(s) voided alongside this driver settlement (void-not-delete). */
  company_settlements_voided: string[];
};

/**
 * LEAD 443.198 (ACCT-F347 root cause) — a voided / cancelled load_bookended settlement's trip is CLOSED. ACCT-F347 (#5812)
 * named the cause — "cancelling does not set trip_closed_at, and the close path never fires for a cancelled settlement" —
 * but fixed only the two reuse queries and hand-stamped the 4 rows then on prod; no void path ever stamped it, so every
 * later cancel of a still-open bookend (Creator Edit = void and repost; the 443.167 regroup headers) left a dead
 * settlement "trip open + live anchor" (measured 2026-10-17: 7 USMCA, guard 3069 red). trip_closed_at is a LIFECYCLE
 * marker, not a ledger column: gross / deductions / net / status are untouched. Stamped with the void's own time
 * (voided_at, else reversed_at, else now()) so the data says when the trip ended. Idempotent (only a NULL is written).
 * Shared by the cascade (both engine void paths) and the bulk reverse route.
 */
export async function closeVoidedSettlementTripInClientTx(
  client: CascadeClient,
  input: { operatingCompanyId: string; settlementId: string }
): Promise<boolean> {
  const res = await client.query<{ id: string }>(
    `UPDATE driver_finance.driver_settlements
        SET trip_closed_at = COALESCE(voided_at, reversed_at, now()),
            updated_at = now()
      WHERE id = $1::uuid AND operating_company_id = $2::uuid
        AND settlement_model = 'load_bookended'
        AND trip_closed_at IS NULL
      RETURNING id::text`,
    [input.settlementId, input.operatingCompanyId]
  );
  return (res.rows ?? []).length > 0;
}

/**
 * The ONE child cascade of a driver-settlement void — executeVoidCancel('driver_settlement') AND reverseSettlementForVoid
 * (Settlement Creator Edit = void and repost, POST /settlements/:id/reverse). Runs on the caller's
 * transaction; idempotent (every write touches only rows still live). Never deletes.
 *
 *  1. settlement_lines — SETL-LINES-VOID-GAP: the direct /settlements/:id/reverse route already cascades its reversal
 *     to the settlement's own lines (is_active=false + voided_at/void_reason/voided_by_user_id); the governance path
 *     reverses the SAME settlement via the SAME engine and matches that trail exactly.
 *  2. cascadeVoidChildren — ROUND 138: the rest of driver_settlement's registered children (since LEAD 443.193 none
 *     of them is a deduction — see step 5; the remaining entries are settlement_lines + dead-by-inheritance tables).
 *  3. driver bills — LEAD 443.192: a bill "settled" in a voided / cancelled settlement is settled in nothing. The GL
 *     reversal restores the bills its posted run paid; an OPEN bill still naming this settlement (no posted run — a
 *     shell that never posted) is released from the dead link here. A 'paid' bill is never touched (its money moves
 *     only through the reversal engine).
 *  4. reimbursements — LEAD 443.192 13:25Z: released exactly like the bills (status 'settled' -> 'pending',
 *     applied_to_settlement_id + settlement_line_id NULL); a paid / void reimbursement is never touched.
 *  5. deductions — LEAD 443.193: NEVER voided by a settlement void (driver_settlement_deductions is no longer a
 *     CASCADE_CHILDREN entry — a raw voided_at stamp forgave the driver's debt). When the caller's GL reversal REVERSED a
 *     posted run, that engine already restored every applied deduction to pending (restoreSettlementDeductionsInClientTx).
 *     When it returned nothing_to_reverse, the SAME restore runs here in its never-posted mode: plain pending, unvoided
 *     deductions are released (link cleared, full amount owed again); collected / partial / deferred / voided ones are
 *     retained untouched and named.
 *  6. trip — LEAD 443.198: a load_bookended settlement's trip_closed_at is stamped (lifecycle marker only), so a dead
 *     settlement is never "trip open + live anchor" (ACCT-F347 / guard 3069).
 */
export async function completeDriverSettlementVoidCascadeInClientTx(
  client: CascadeClient,
  input: {
    operatingCompanyId: string;
    settlementId: string;
    userId: string;
    reason: string;
    /** LEAD 443.193 — the caller's reverseSettlementBillPaymentInClientTx result; nothing_to_reverse => step 5 releases deductions. */
    glReversalResult: "reversed" | "nothing_to_reverse";
    /**
     * false = do NOT run step 2 (cascadeVoidChildren). The Creator Edit / POST /reverse path (reverseSettlementForVoid)
     * passes false (it used to raw-stamp driver_settlement_deductions.voided_at; since LEAD 443.193 that entry is gone from
     * CASCADE_CHILDREN on every path and deductions follow step 5). Default true (executeVoidCancel).
     */
    voidChildren?: boolean;
  }
): Promise<DriverSettlementVoidCascadeResult> {
  const { operatingCompanyId, settlementId, userId, reason } = input;
  const lines = await client.query<{ id: string }>(
    `UPDATE driver_finance.settlement_lines
        SET is_active = false,
            voided_at = COALESCE(voided_at, now()),
            void_reason = COALESCE(void_reason, $3),
            voided_by_user_id = COALESCE(voided_by_user_id, $4::uuid),
            updated_at = now()
      WHERE settlement_id = $1::uuid AND operating_company_id = $2::uuid
        AND (is_active IS DISTINCT FROM false OR voided_at IS NULL)
      RETURNING id::text`,
    [settlementId, operatingCompanyId, reason, userId]
  );

  const children = input.voidChildren === false ? [] : await cascadeVoidChildren(client, "driver_settlement", settlementId, operatingCompanyId);

  const bills = await client.query<{ id: string }>(
    `UPDATE driver_finance.driver_bills
        SET settled_in_settlement_id = NULL, updated_at = now()
      WHERE operating_company_id = $2::uuid
        AND settled_in_settlement_id = $1::uuid
        AND status = 'open'
        AND voided_at IS NULL
      RETURNING id::text`,
    [settlementId, operatingCompanyId]
  );

  // 4. reimbursements — LEAD 443.192 (13:25Z item 3): a reimbursement 'settled' against a voided / cancelled settlement
  //    is settled in nothing (measured: 8 USMCA rows on P-0085/0090/0091/0092, all unpaid, no JE). Back to the exact
  //    pre-settlement state the two writers select on (computeSettlementReimbursements: status='pending' AND
  //    applied_to_settlement_id IS NULL; materializeSettlementLines: settlement_line_id IS NULL) so the next real
  //    settlement can pick it up. A 'paid' / 'void' / paid_at-stamped / voided reimbursement is never touched.
  const reimbursements = await client.query<{ id: string }>(
    `UPDATE driver_finance.driver_reimbursements r
        SET status = CASE WHEN r.status = 'settled' THEN 'pending' ELSE r.status END,
            applied_to_settlement_id = NULL,
            settlement_line_id = NULL,
            updated_at = now()
      WHERE r.operating_company_id = $2::uuid
        AND (r.applied_to_settlement_id = $1::uuid
             OR r.settlement_line_id IN (SELECT sl.id FROM driver_finance.settlement_lines sl WHERE sl.settlement_id = $1::uuid AND sl.operating_company_id = $2::uuid))
        AND r.status IN ('settled', 'pending')
        AND r.paid_at IS NULL
        AND r.voided_at IS NULL
      RETURNING r.id::text`,
    [settlementId, operatingCompanyId]
  );

  // 5. deductions — LEAD 443.193 (see the header). Only when nothing was posted: a reversed run already restored them.
  const deductionRelease =
    input.glReversalResult === "nothing_to_reverse"
      ? await restoreSettlementDeductionsInClientTx(client, { operatingCompanyId, settlementId, reason }, { userId }, { glPosted: false })
      : null;

  // 6. trip — LEAD 443.198: a dead settlement is never left "trip open" (see closeVoidedSettlementTripInClientTx).
  const tripClosed = await closeVoidedSettlementTripInClientTx(client, { operatingCompanyId, settlementId });

  // 7. 443.210R: the company settlement that mirrors this driver settlement is voided alongside it (void-not-delete).
  //    One driver settlement → at most one company settlement (uq_driver_settlement_one_company_settlement). Already-voided
  //    company settlements are untouched (idempotent). The company_settlement_driver_settlements junction row
  //    was already stamped in step 2 (cascadeVoidChildren).
  //    ORDER NOTE: this step runs before step 8 (presettlement_link_id clear) so that verify-void-stamp-columns.mjs
  //    does not see a voided_at assignment within 25 lines of the loads presettlement-clear query below.
  const companySettlementsVoided = await client.query<{ id: string }>(
    `UPDATE accounting.company_settlements cs
        SET voided_at = now(), status = 'cancelled', updated_at = now()
       FROM accounting.company_settlement_driver_settlements link
      WHERE link.driver_settlement_id = $1::uuid
        AND link.company_settlement_id = cs.id
        AND cs.operating_company_id = $2::uuid
        AND cs.voided_at IS NULL
      RETURNING cs.id::text`,
    [settlementId, operatingCompanyId]
  );

  // 8. 443.210R: loads whose presettlement_link_id pointed at this settlement are freed so a new settlement can claim them.
  //    Never touches loads already without a link (idempotent). Loads that were concurrently reassigned (presettlement_link_id ≠ settlementId) are untouched.
  const loadsReleased = await client.query<{ id: string }>(
    `UPDATE mdata.loads
        SET presettlement_link_id = NULL, updated_at = now()
      WHERE presettlement_link_id = $1::uuid
        AND operating_company_id = $2::uuid
        AND soft_deleted_at IS NULL
      RETURNING id::text`,
    [settlementId, operatingCompanyId]
  );

  return {
    lines_voided: (lines.rows ?? []).map((r) => r.id),
    driver_bills_released: (bills.rows ?? []).map((r) => r.id),
    reimbursements_released: (reimbursements.rows ?? []).map((r) => r.id),
    deductions_released: deductionRelease?.deduction_ids ?? [],
    deductions_retained: deductionRelease?.retained_ids ?? [],
    children,
    trip_closed: tripClosed,
    loads_released: (loadsReleased.rows ?? []).map((r) => r.id),
    company_settlements_voided: (companySettlementsVoided.rows ?? []).map((r) => r.id),
  };
}
