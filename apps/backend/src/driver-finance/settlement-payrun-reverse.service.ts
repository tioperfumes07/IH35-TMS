// SETTLEMENT-PAYRUN-REVERSE — the missing reverse counterpart for closeSettlementPayRun.
//
// closeSettlementPayRun (settlement-payrun-close.service.ts) is the ONLY poster that ever posted the
// 17 live USMCA driver settlements: it writes ONE balanced JE via createJournalEntry (Dr driver pay /
// reimbursement / detention, Cr each deduction-recovery role, Cr abandonment chargeback, Cr cash-advance
// clearing, Cr driver escrow liability, Cr net-cash disbursement method), stamps
// driver_finance.payrun_gl_runs (journal_entry_id, status='posted'), recovers the driver's un-recovered
// driver_advances (recovered_in_settlement_id + driver_liabilities balance sync), records the escrow
// contribution (driver_finance.escrow_balances / escrow_ledger + accounting.escrow_postings), and stamps
// driver_settlements.posted_at + a records-only disbursement.
//
// There was NO reverse counterpart for that path — the only packaged settlement reversal
// (reverseSettlementBillPayment) targets the DIFFERENT bill-payment poster
// (driver_settlement_gl_runs / driver_settlement_gl_bills), which has ZERO rows in prod and was never
// used for USMCA. This is that missing engine, built the GAAP / QuickBooks / NetSuite / McLeod way:
// a full equal-and-opposite REVERSING entry (never an in-place edit), then the caller reposts fresh.
//
// NO NEW GL MATH: the ledger reversal is delegated whole to the existing reviewed primitive
// reverseJournalEntryNoFlip (one linked reversing JE that nets every original leg to zero) and the
// existing recordEscrowPostingOnly. This service only inverts the NON-GL sub-ledger STATE the close
// mutated (advance recovery, escrow running balances, records-only disbursement, posted_at) and voids
// the run — then PROVES the GL is equal-and-opposite at the (account, class, entity) grain before it
// returns. Fail-loud on any mismatch; the caller's transaction rolls back.
//
// SCOPE (matches the bill-payment reversal's division of labour): this poster reverses GL + run + the
// sub-ledgers the close touched. settlement_lines de-activation + settlement header lifecycle are the
// ORCHESTRATION layer's job (as the /settlements/:id/reverse route does for the bill-payment path),
// because the 17→21 signed-doc rebuild creates FRESH settlements rather than reposting the same id.

import { withCurrentUser } from "../auth/db.js";
import { companyBusinessDate } from "../lib/company-business-date.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { reverseJournalEntryNoFlip } from "../accounting/journal-entries.service.js";
import { recordEscrowPostingOnly } from "../accounting/escrow/service.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

type Actor = { userId: string };

export class SettlementPayRunReversalError extends Error {
  code: string;
  details?: Record<string, unknown>;
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "SettlementPayRunReversalError";
    this.code = code;
    this.details = details;
  }
}

export type SettlementPayRunReversalResult = {
  result: "reversed" | "nothing_to_reverse";
  settlement_id: string;
  run_id: string | null;
  reversal_journal_entry_id: string | null;
  advances_restored: number;
  escrow_reversed_cents: number;
};

function scoped<T>(actor: Actor, operatingCompanyId: string, fn: (client: DbClient) => Promise<T>): Promise<T> {
  return withCurrentUser(actor.userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    return fn(client as DbClient);
  });
}

/**
 * Reverse a pay-run-posted driver settlement (equal-and-opposite; never edits the original). Opens its
 * own scoped transaction. See reverseSettlementPayRunInClientTx for the in-transaction variant used by
 * the 17→21 rebuild orchestration (one settlement corrected once, in one pass).
 */
export async function reverseSettlementPayRun(
  input: { operatingCompanyId: string; settlementId: string; reason: string },
  actor: Actor
): Promise<SettlementPayRunReversalResult> {
  const currentBusinessDate = companyBusinessDate();
  return scoped(actor, input.operatingCompanyId, (client) =>
    reverseSettlementPayRunInClientTx(client, input, actor, currentBusinessDate)
  );
}

export async function reverseSettlementPayRunInClientTx(
  client: DbClient,
  input: { operatingCompanyId: string; settlementId: string; reason: string },
  actor: Actor,
  currentBusinessDate: string
): Promise<SettlementPayRunReversalResult> {
  const opco = input.operatingCompanyId;
  const settlementId = input.settlementId;
  const reason = input.reason?.trim();
  if (!reason) {
    throw new SettlementPayRunReversalError("REASON_REQUIRED", "A non-empty reason is required to reverse a settlement");
  }

  // ── Lock the pay-run GL run. Only a 'posted' run with a JE is reversible. ─────────────────────────
  const runRes = await client.query<{ id: string; status: string; journal_entry_id: string | null }>(
    `SELECT id::text, status, journal_entry_id::text
       FROM driver_finance.payrun_gl_runs
      WHERE operating_company_id = $1::uuid AND settlement_id = $2::uuid
      LIMIT 1 FOR UPDATE`,
    [opco, settlementId]
  );
  const run = runRes.rows[0] ?? null;
  if (!run || run.status !== "posted" || !run.journal_entry_id) {
    return {
      result: "nothing_to_reverse",
      settlement_id: settlementId,
      run_id: run?.id ?? null,
      reversal_journal_entry_id: null,
      advances_restored: 0,
      escrow_reversed_cents: 0,
    };
  }
  const originalJeId = run.journal_entry_id;

  const settRes = await client.query<{ driver_id: string; display_id: string | null }>(
    `SELECT driver_id::text, display_id
       FROM driver_finance.driver_settlements
      WHERE operating_company_id = $1::uuid AND id = $2::uuid
      LIMIT 1 FOR UPDATE`,
    [opco, settlementId]
  );
  const settlement = settRes.rows[0];
  if (!settlement) {
    throw new SettlementPayRunReversalError("SETTLEMENT_NOT_FOUND", `Settlement ${settlementId} not found`);
  }
  const label = `Settlement ${settlement.display_id ?? settlementId}`;

  // ── (1) Reverse the ENTIRE pay-run JE via the existing linked-reversal primitive. One reversing JE
  //        nets every original leg (pay, reimbursement, detention, deductions, chargeback, advance
  //        clearing, escrow liability, net cash) to zero. No bespoke GL math here. ───────────────────
  const jeReversal = await reverseJournalEntryNoFlip(client as never, {
    operatingCompanyId: opco,
    journalEntryId: originalJeId,
    reason: `${label}: ${reason}`,
    actorUserId: actor.userId,
    currentBusinessDate,
  });
  const reversalJeId = jeReversal.reversal?.reversal_journal_entry_id ?? null;
  if (!reversalJeId) {
    throw new SettlementPayRunReversalError("JE_REVERSAL_MISSING", `Pay-run JE ${originalJeId} produced no reversing entry`);
  }

  // ── (2) Equal-and-opposite proof at the full accounting dimension grain. Original + reversal must
  //        net to zero by (account, class, entity); a standalone-balanced reversal is insufficient. ──
  const proof = await client.query<{ journal_count: number; nonzero_dimensions: number; absolute_residual_cents: number }>(
    `
      WITH selected AS (
        SELECT journal_entry_uuid, account_id, class_id, entity_uuid,
               CASE WHEN debit_or_credit = 'debit' THEN amount_cents ELSE -amount_cents END AS signed_cents
        FROM accounting.journal_entry_postings
        WHERE operating_company_id = $1::uuid
          AND journal_entry_uuid = ANY($2::uuid[])
      ),
      dimensional AS (
        SELECT account_id, class_id, entity_uuid, SUM(signed_cents)::bigint AS residual_cents
        FROM selected
        GROUP BY account_id, class_id, entity_uuid
      )
      SELECT
        (SELECT COUNT(DISTINCT journal_entry_uuid)::int FROM selected) AS journal_count,
        COUNT(*) FILTER (WHERE residual_cents <> 0)::int AS nonzero_dimensions,
        COALESCE(SUM(ABS(residual_cents)), 0)::bigint AS absolute_residual_cents
      FROM dimensional
    `,
    [opco, [originalJeId, reversalJeId]]
  );
  const rec = proof.rows[0];
  if (
    Number(rec?.journal_count ?? 0) !== 2 ||
    Number(rec?.nonzero_dimensions ?? 0) !== 0 ||
    Number(rec?.absolute_residual_cents ?? 0) !== 0
  ) {
    throw new SettlementPayRunReversalError(
      "REVERSAL_NOT_EQUAL_AND_OPPOSITE",
      `Pay-run reversal is not equal-and-opposite: journals=${Number(rec?.journal_count ?? 0)} ` +
        `nonzero_dimensions=${Number(rec?.nonzero_dimensions ?? 0)} residual_cents=${Number(rec?.absolute_residual_cents ?? 0)}`
    );
  }

  // ── (3) Un-recover advances the close cleared through THIS settlement (recovered_in_settlement_id).
  //        Full-recovery only ever sets recovered_in_settlement_id (partial recoveries keep it NULL and
  //        only move outstanding_balance) — so this inverse is exact for every row we can attribute.
  //        Relative adjustments (+ amount / − amount) keep cross-settlement liability history correct. ─
  const advRes = await client.query<{ id: string; amount: string; liability_id: string | null }>(
    `SELECT id::text, amount::text, liability_id::text
       FROM driver_finance.driver_advances
      WHERE operating_company_id = $1::uuid AND recovered_in_settlement_id = $2::uuid
      FOR UPDATE`,
    [opco, settlementId]
  );
  for (const adv of advRes.rows) {
    await client.query(
      `UPDATE driver_finance.driver_advances
          SET recovered_in_settlement_id = NULL,
              status = 'active',
              outstanding_balance = outstanding_balance + $3::numeric,
              updated_at = now()
        WHERE id = $1::uuid AND operating_company_id = $2::uuid AND recovered_in_settlement_id = $4::uuid`,
      [adv.id, opco, adv.amount, settlementId]
    );
    if (adv.liability_id) {
      await client.query(
        `UPDATE driver_finance.driver_liabilities
            SET current_balance = current_balance + $3::numeric,
                paid_to_date = GREATEST(0, paid_to_date - $3::numeric),
                status = 'active',
                updated_at = now()
          WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
        [adv.liability_id, opco, adv.amount]
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
        AND source_id = $2::text
        AND posting_type = 'deposit'`,
    [opco, settlementId]
  );
  const escrowCents = Number(escRes.rows[0]?.total ?? 0);
  if (escrowCents > 0) {
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
    const balRes = await client.query<{ id: string; current_balance_cents: number }>(
      `UPDATE driver_finance.escrow_balances
          SET total_held_cents = GREATEST(0, total_held_cents - $3),
              current_balance_cents = current_balance_cents - $3,
              last_updated_at = now()
        WHERE operating_company_id = $1::uuid AND driver_id = $2::uuid
        RETURNING id::text, current_balance_cents`,
      [opco, settlement.driver_id, escrowCents]
    );
    const balanceRow = balRes.rows[0];
    if (balanceRow) {
      await client.query(
        `INSERT INTO driver_finance.escrow_ledger
           (operating_company_id, driver_id, escrow_balance_id, settlement_id, transaction_type, amount_cents, running_balance_cents, description)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'release', $5, $6, $7)`,
        [
          opco,
          settlement.driver_id,
          balanceRow.id,
          settlementId,
          escrowCents,
          balanceRow.current_balance_cents,
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
    throw new SettlementPayRunReversalError("RUN_STATE_TRANSITION_FAILED", `Pay-run run ${run.id} could not transition posted -> void`);
  }

  await appendCrudAudit(
    client as never,
    actor.userId,
    "driver_finance.settlement.payrun_reversed",
    {
      resource_type: "driver_finance.driver_settlements",
      resource_id: settlementId,
      operating_company_id: opco,
      run_id: run.id,
      driver_id: settlement.driver_id,
      reason,
      original_journal_entry_id: originalJeId,
      reversal_journal_entry_id: reversalJeId,
      advances_restored: advRes.rows.length,
      escrow_reversed_cents: escrowCents,
      reconciliation: { journal_count: 2, nonzero_dimensions: 0, absolute_residual_cents: 0 },
    },
    "warning",
    "SETTLEMENT-PAYRUN-REVERSE"
  );

  return {
    result: "reversed",
    settlement_id: settlementId,
    run_id: run.id,
    reversal_journal_entry_id: reversalJeId,
    advances_restored: advRes.rows.length,
    escrow_reversed_cents: escrowCents,
  };
}
