// LEAD 443.192 — the ONE driver-settlement void cascade (lines voided, open driver bills + unpaid reimbursements released
// from the dead settlement, registered children). Shared by governance executeVoidCancel('driver_settlement') and
// driver-finance reverseSettlementForVoid. A leaf module (imports only the cascade-void engine) so neither caller pulls
// the other's dependency graph. Never deletes; every write touches only rows still linked/live (idempotent).
import { cascadeVoidChildren } from "../accounting/cascade-void-engine.service.js";

type CascadeClient = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

export type DriverSettlementVoidCascadeResult = {
  lines_voided: string[];
  driver_bills_released: string[];
  reimbursements_released: string[];
  children: Awaited<ReturnType<typeof cascadeVoidChildren>>;
};

/**
 * The ONE child cascade of a driver-settlement void — executeVoidCancel('driver_settlement') AND reverseSettlementForVoid
 * (Settlement Creator Edit = void and repost, POST /settlements/:id/reverse). Runs on the caller's
 * transaction; idempotent (every write touches only rows still live). Never deletes.
 *
 *  1. settlement_lines — SETL-LINES-VOID-GAP: the direct /settlements/:id/reverse route already cascades its reversal
 *     to the settlement's own lines (is_active=false + voided_at/void_reason/voided_by_user_id); the governance path
 *     reverses the SAME settlement via the SAME engine and matches that trail exactly.
 *  2. cascadeVoidChildren — ROUND 138: the rest of driver_settlement's registered children
 *     (driver_settlement_deductions.voided_at, chiefly).
 *  3. driver bills — LEAD 443.192: a bill "settled" in a voided / cancelled settlement is settled in nothing. The GL
 *     reversal restores the bills its posted run paid; an OPEN bill still naming this settlement (no posted run — a
 *     shell that never posted) is released from the dead link here. A 'paid' bill is never touched (its money moves
 *     only through the reversal engine).
 *  4. reimbursements — LEAD 443.192 13:25Z: released exactly like the bills (status 'settled' -> 'pending',
 *     applied_to_settlement_id + settlement_line_id NULL); a paid / void reimbursement is never touched.
 */
export async function completeDriverSettlementVoidCascadeInClientTx(
  client: CascadeClient,
  input: {
    operatingCompanyId: string;
    settlementId: string;
    userId: string;
    reason: string;
    /**
     * false = do NOT run step 2 (cascadeVoidChildren raw-stamps driver_settlement_deductions.voided_at). The Creator Edit /
     * POST /reverse path (reverseSettlementForVoid) passes false: its deductions go only through the owner-ruled
     * three-branch engine (reverseDeductionForVoid -> voidSettlementDeduction, "why would I forgive the debt") or are
     * restored to pending by the GL reversal — a raw voided_at stamp on an applied-but-uncollected deduction there would
     * forgive the driver's debt. Default true (executeVoidCancel's existing behaviour, unchanged).
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

  return {
    lines_voided: (lines.rows ?? []).map((r) => r.id),
    driver_bills_released: (bills.rows ?? []).map((r) => r.id),
    reimbursements_released: (reimbursements.rows ?? []).map((r) => r.id),
    children,
  };
}
