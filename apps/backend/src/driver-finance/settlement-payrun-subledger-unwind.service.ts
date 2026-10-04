/**
 * ROUND 300 (CC-1) — the pay-run SUB-LEDGER unwind, shared by the one settlement reverser. A settlement close
 * (closeSettlementPayRun) writes, besides its journal entries: advance recoveries (driver_advances.recovered_in_
 * settlement_id / outstanding_balance + driver_liabilities), the escrow contribution (accounting.escrow_postings
 * 'deposit' + driver_finance.escrow_balances + escrow_ledger 'hold'), the records-only disbursement stamp, and the
 * payrun_gl_runs claim. This unwinds exactly those, equal-and-opposite, on the CALLER's transaction. It writes no
 * journal entry: the caller has already reversed the journal entries (reverseJournalEntryNoFlip / bill + bill
 * payment voids) and passes the original + reversing JE ids for the both-way links.
 * Callers: reverseSettlementBillPaymentInClientTx (the canonical settlement reverser, via voidDocument('settlement'))
 * and reverseSettlementPayRunInClientTx (legacy single-JE pay runs). It must never run without the JE reversal.
 */
import { signedEscrowLedgerAmountCents } from "./escrow-ledger-sign.js";
import { recordEscrowPostingOnly } from "../accounting/escrow/service.js";
import type { RecoverySnapshot } from "./settlement-payrun-recovery.service.js";
import { ensureEscrowBalanceRow } from "./escrow-balance-row.js";

type DbClient = { query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number | null }> };

export class PayRunSubledgerUnwindError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "PayRunSubledgerUnwindError";
  }
}

export async function unwindPayRunSubledgersInClientTx(
  client: DbClient,
  input: {
    operatingCompanyId: string;
    settlementId: string;
    driverId: string;
    runId: string;
    label: string;
    reason: string;
    originalJeId: string;
    reversalJeId: string;
    recoveries: RecoverySnapshot[];
  },
  actor: { userId: string }
): Promise<{ advances_restored: number; escrow_reversed_cents: number }> {
  const opco = input.operatingCompanyId;
  const settlementId = input.settlementId;
  const settlement = { driver_id: input.driverId };
  const run = { id: input.runId };
  const { label, reason, originalJeId, reversalJeId, recoveries } = input;
  // ── (3) Un-recover advances the close cleared through THIS settlement (recovered_in_settlement_id).
  //        Full-recovery only ever sets recovered_in_settlement_id (partial recoveries keep it NULL and
  //        only move outstanding_balance) — so this inverse is exact for every row we can attribute.
  //        Relative adjustments (+ amount / − amount) keep cross-settlement liability history correct. ─
  for (const adv of recoveries) {
    await client.query(
      `UPDATE driver_finance.driver_advances
          SET recovered_in_settlement_id = NULL,
              status = 'active',
              outstanding_balance = outstanding_balance + $3::numeric,
              updated_at = now()
        WHERE id = $1::uuid AND operating_company_id = $2::uuid
          AND (recovered_in_settlement_id = $4::uuid OR recovered_in_settlement_id IS NULL)`,
      [adv.id, opco, (adv.recovered_cents / 100).toFixed(2), settlementId]
    );
    if (adv.liability_id) {
      await client.query(
        `UPDATE driver_finance.driver_liabilities
            SET current_balance = current_balance + $3::numeric,
                paid_to_date = GREATEST(0, paid_to_date - $3::numeric),
                status = 'active',
                updated_at = now()
          WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
        [adv.liability_id, opco, (adv.recovered_cents / 100).toFixed(2)]
      );
    }
  }

  // ── (4) Reverse the escrow contribution. The GL escrow-liability credit is already reversed by the
  //        JE reversal (2); this inverts the SUB-LEDGERS the close also wrote: the GL-linked
  //        accounting.escrow_accounts balance (via recordEscrowPostingOnly 'release', which the migration
  //        0234 trigger applies as a negative delta) and the pay-run cap summary
  //        driver_finance.escrow_balances + escrow_ledger. Amount = the deposit(s) this settlement posted. ─
  const escRes = await client.query<{ total: string }>(
    `SELECT COALESCE(SUM(amount_cents), 0)::bigint AS total
       FROM accounting.escrow_postings
      WHERE operating_company_id = $1::uuid
        AND source_type = 'driver_settlement'
        AND source_id = $2::uuid
        AND posting_type = 'deposit'
        AND linked_journal_entry_id = $3::uuid`,
    [opco, settlementId, originalJeId]
  );
  const escrowCents = Number(escRes.rows[0]?.total ?? 0);
  if (escrowCents > 0) {
    // ESCROW-UNWIND-NET-FLOOR (Lead, 2026-10-04): the unwind may give back only what this settlement still holds —
    // every deposit it made minus every release / forfeiture already taken against it. 09-24/25 the unwind reversed
    // whole deposits that releases had already drawn, and three drivers went to a debit balance. Refuse by name;
    // never clamp, never record a partial. (A claimless release cannot be netted here — releases now must name their
    // claim, and recordEscrowPostingOnly refuses any release that leaves the account below zero.)
    const netRes = await client.query<{ held: string }>(
      `SELECT COALESCE(SUM(CASE WHEN posting_type = 'deposit' THEN amount_cents ELSE -amount_cents END), 0)::bigint AS held
         FROM accounting.escrow_postings
        WHERE operating_company_id = $1::uuid
          AND source_type = 'driver_settlement'
          AND source_id = $2::uuid`,
      [opco, settlementId]
    );
    const heldForSettlement = Number(netRes.rows[0]?.held ?? 0);
    if (heldForSettlement < escrowCents) {
      throw new Error(
        `escrow_unwind_exceeds_held_for_settlement: ${label} holds ${heldForSettlement} cents of escrow ` +
          `(deposits minus prior releases) but the unwind would release ${escrowCents}`
      );
    }
    // GL-linked escrow balance: a 'release' posting applies −escrowCents via the DB trigger, linked to
    // the reversing JE for a both-way audit trail. Mirrors closeSettlementPayRun's recordEscrowPostingOnly
    // 'deposit' one-for-one.
    await recordEscrowPostingOnly(client as never, {
      operating_company_id: opco,
      driver_id: settlement.driver_id,
      posting_type: "release",
      amount_cents: escrowCents,
      source_type: "driver_settlement",
      source_id: settlementId,
      note: `${label} — escrow contribution reversal: ${reason}`,
      posted_by_user_id: actor.userId,
      linked_journal_entry_id: reversalJeId,
    });
    // Pay-run cap summary + detailed ledger: undo the 'hold' the close appended (running balance falls
    // back by escrowCents). total_held is reduced (the hold is being unwound, not paid out).
    // KILL THE SECOND SYSTEM (tables 2-5): the reversal JE IS the balance change; the ledger row records it.
    const balanceRow = { id: await ensureEscrowBalanceRow(client as never, opco, settlement.driver_id) };
    if (balanceRow) {
      await client.query(
        `INSERT INTO driver_finance.escrow_ledger
           (operating_company_id, driver_id, escrow_balance_id, settlement_id, transaction_type, amount_cents, description)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'release', $5, $6)`,
        [
          opco,
          settlement.driver_id,
          balanceRow.id,
          settlementId,
          // ESCROW-LEDGER-SIGN-01: undoing a hold reads as a 'release' to the driver (positive) --
          // already correct by construction here, routed through the shared helper for consistency.
          signedEscrowLedgerAmountCents("release", escrowCents),
          `${label} — escrow contribution reversal: ${reason}`,
        ]
      );
    }
  }

  // ── (5) Clear the records-only disbursement + the posted_at stamp (the settlement is no longer posted). ─
  await client.query(
    `UPDATE driver_finance.driver_settlements
        SET payment_method = NULL,
            payment_bank_reference = NULL,
            paid_via_bank_txn_id = NULL,
            posted_at = NULL,
            posted_by_user_id = NULL,
            updated_at = now()
      WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
    [settlementId, opco]
  );

  // ── (6) Void the run (status CHECK admits only 'posted'/'void'; reuse 'void' = reversed here). The
  //        reversal metadata lives in the immutable CRUD audit below. ────────────────────────────────
  const voided = await client.query<{ id: string }>(
    `UPDATE driver_finance.payrun_gl_runs
        SET status = 'void'
      WHERE id = $1::uuid AND operating_company_id = $2::uuid AND status = 'posted'
      RETURNING id::text`,
    [run.id, opco]
  );
  if (!voided.rows[0]?.id) {
    throw new PayRunSubledgerUnwindError("RUN_STATE_TRANSITION_FAILED", `Pay-run run ${run.id} could not transition posted -> void`);
  }

  return { advances_restored: recoveries.length, escrow_reversed_cents: escrowCents };
}
