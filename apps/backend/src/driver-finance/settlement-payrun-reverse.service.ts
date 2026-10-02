import { assertNoHistoricalSettlementCoverage } from "./settlement-historical-attribution.service.js";
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
import { loadPayRunRecoveryReversal } from "./settlement-payrun-recovery.service.js";
import { unwindPayRunSubledgersInClientTx } from "./settlement-payrun-subledger-unwind.service.js";
import { reverseSettlementForVoid } from "./void-document-callees.service.js";

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

  // Same lock order as close and continuation: settlement first, then the pay-run anchor.
  await client.query(`SELECT id FROM driver_finance.driver_settlements
    WHERE id = $1::uuid AND operating_company_id = $2::uuid FOR UPDATE`, [settlementId, opco]);

  await assertNoHistoricalSettlementCoverage(client, opco, settlementId);

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

  // ROUND 300 (CC-1, proven on a Neon fork) — ONE settlement reverser. A settlement posted through the per-load A/P
  // chain (bills, non-cash applications, net-pay bill payments) carries a driver_settlement_gl_runs spine whose
  // application JE (or first bill JE) is this pay-run's journal_entry_id. Reversing only that JE here reported
  // "reversed" while the bills, the bill payments and their JEs stayed posted ($3,335.32 left on the fork, settlement
  // still 'closed'). Such a settlement is undone by the canonical document reverser (voidDocument('settlement') ->
  // reverseSettlementForVoid), which voids every bill payment and bill, reverses the application JE, unwinds the
  // pay-run sub-ledgers and flips the settlement — this route delegates to it rather than half-reverse.
  const chainRun = await client.query<{ id: string }>(
    `SELECT r.id::text FROM driver_finance.driver_settlement_gl_runs r
      WHERE r.operating_company_id = $1::uuid AND r.settlement_id = $2::uuid AND r.status = 'posted'
        AND (r.deduction_journal_entry_id = $3::uuid
             OR EXISTS (SELECT 1 FROM driver_finance.driver_settlement_gl_bills b WHERE b.run_id = r.id AND b.bill_journal_entry_id = $3::uuid))
      LIMIT 1`,
    [opco, settlementId, originalJeId]
  );
  if (chainRun.rows[0]) {
    const voided = await reverseSettlementForVoid(client as never, { operatingCompanyId: opco, settlementId, reason, actor });
    return {
      result: "reversed",
      settlement_id: settlementId,
      run_id: run.id,
      reversal_journal_entry_id: voided.reversalJournalEntryId,
      advances_restored: voided.payrunUnwind?.advances_restored ?? 0,
      escrow_reversed_cents: voided.payrunUnwind?.escrow_reversed_cents ?? 0,
    };
  }

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
  const recoveries = await loadPayRunRecoveryReversal(client, {
    operatingCompanyId: opco, settlementId, journalEntryId: originalJeId,
  });

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

  // ── (3)–(6) Advances, escrow, disbursement stamp, pay-run run: the shared sub-ledger unwind. ───────────────
  const { escrow_reversed_cents: escrowCents } = await unwindPayRunSubledgersInClientTx(
    client,
    { operatingCompanyId: opco, settlementId, driverId: settlement.driver_id, runId: run.id, label, reason, originalJeId, reversalJeId, recoveries },
    actor
  );

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
      advances_restored: recoveries.length,
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
    advances_restored: recoveries.length,
    escrow_reversed_cents: escrowCents,
  };
}
