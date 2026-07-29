// FH-3 loan-payment GL posting engine (TIER-1 FINANCIAL; flag OFF by default).
//
// The FH-3 amortization engine (apps/backend/src/finance/amortization) persists loans + their
// principal/interest schedule to finance.* and posts NOTHING — that boundary is enforced by
// scripts/verify-fh3-no-posting.mjs and stays intact. This file is the missing counterpart: the
// gated poster that turns an already-computed, already-stored scheduled payment into the 3-leg
// entry described in docs/specs/finance-hub/AMORTIZATION-DATA-MODEL.md §6.
//
//   Dr  finance.loans.gl_liability_account_id         = row.principal_cents
//   Dr  finance.loans.gl_interest_expense_account_id  = row.interest_cents
//   Cr  finance.loans.payment_account_id              = row.payment_cents
//
// REUSES the established accounting spine (NO new GL math, NO second header/line INSERT): the JE
// header, the balanced posting lines, the source links, the deterministic idempotency key and the
// closed-period cutoff all come from ../amortization-posting/amortization-posting.service.ts, which is
// the one place in the codebase those journal-entry writes live. Accounts come from the LOAN ROW's own
// FK columns, not role bindings — same posture as the prepaid/depreciation posters.
//
// IDEMPOTENT per (loan, payment_number): the row.posted latch plus the deterministic idempotency_key on
// journal_entry_postings (uq_jep_company_idempotency_line) make a due-date run safely re-runnable with
// NO double-post. Reversal reuses the shared void path (postVoidReversal) — never DELETE.
//
// FLAG GATE: FINANCE_HUB_AMORTIZATION_POST_ENABLED (default OFF) -> NO-OP, zero JEs / financial rows.

import { withCurrentUser } from "../../auth/db.js";
import { isEnabled } from "../../lib/feature-flags/service.js";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { assertBalanced } from "../amortization-posting/amortization-posting.math.js";
import {
  findExistingPostedJe,
  insertBalancedPostingLines,
  insertJournalEntryHeader,
  readClosedPeriodCutoff,
  type DbClient,
  type LineToPost,
} from "../amortization-posting/amortization-posting.service.js";
import { postVoidReversal } from "../void.service.js";
import {
  FINANCE_HUB_AMORTIZATION_POST_FLAG_KEY,
  LoanPaymentPostingError,
  buildLoanPaymentIdempotencyKey,
  buildLoanPaymentLines,
} from "./loan-payment-posting.math.js";
import { companyBusinessDate } from "../../lib/company-business-date.js";

type Actor = { userId: string };

type PostedPayment = {
  payment_number: number;
  journal_entry_id: string;
  principal_cents: number;
  interest_cents: number;
  payment_cents: number;
};

export type LoanPaymentPostingResult =
  | { result: "skipped_flag_off"; loan_id: string; posted_payments: PostedPayment[] }
  | { result: "nothing_to_post"; loan_id: string; posted_payments: PostedPayment[] }
  | {
      result: "posted";
      loan_id: string;
      posted_payments: PostedPayment[];
      payment_count: number;
      total_principal_cents: number;
      total_interest_cents: number;
      total_paid_cents: number;
    };

export type LoanPaymentReversalResult = {
  result: "reversed" | "nothing_to_reverse";
  loan_id: string;
  reversed_payments: Array<{ payment_number: number; journal_entry_id: string; reversal_journal_entry_id: string | null }>;
};

type LoanRow = {
  id: string;
  name: string;
  status: string;
  gl_liability_account_id: string | null;
  gl_interest_expense_account_id: string | null;
  payment_account_id: string | null;
};

type LoanAmortRow = {
  id: string;
  payment_number: number;
  due_date: string;
  payment_cents: string;
  principal_cents: string;
  interest_cents: string;
};

const todayIso = (): string => companyBusinessDate();

/** Closed-period guard — reuses the shared cutoff read (no second copy of that query). */
async function assertOpenPeriod(client: DbClient, operatingCompanyId: string, postingDate: string): Promise<void> {
  const closedThrough = await readClosedPeriodCutoff(client, operatingCompanyId);
  if (closedThrough && postingDate <= closedThrough) {
    throw new LoanPaymentPostingError(
      "PERIOD_LOCKED",
      `Posting date ${postingDate} is in a closed period (closed_through=${closedThrough})`,
      { closed_through: closedThrough, posting_date: postingDate }
    );
  }
}

/**
 * Resolve the idempotency key to use for one scheduled payment, and any LIVE entry already posted
 * under it.
 *
 * A plain "reuse the base key" lookup is not enough once a payment has been REVERSED: the reversed
 * entry's lines keep the base key, so a corrected re-run would re-link the row to the VOIDED entry
 * (net-zero GL) and report it as posted — a phantom payment. Inserting under the base key again is
 * equally wrong: uq_jep_company_idempotency_line would swallow the lines (ON CONFLICT DO NOTHING) and
 * leave an empty header. So a voided attempt advances a deterministic revision suffix (`:r1`, `:r2`, …)
 * and the re-post lands on its own clean key. Idempotency is preserved: the first key whose entry is
 * still live is reused, and an unposted payment always resolves to the same next key.
 */
async function resolvePaymentIdempotency(
  client: DbClient,
  operatingCompanyId: string,
  loanId: string,
  paymentNumber: number
): Promise<{ idempotencyKey: string; liveJournalEntryId: string | null }> {
  const base = buildLoanPaymentIdempotencyKey(operatingCompanyId, loanId, paymentNumber);
  const MAX_REVISIONS = 50;
  for (let revision = 0; revision <= MAX_REVISIONS; revision += 1) {
    const idempotencyKey = revision === 0 ? base : `${base}:r${revision}`;
    const journalEntryId = await findExistingPostedJe(client, operatingCompanyId, idempotencyKey);
    if (!journalEntryId) return { idempotencyKey, liveJournalEntryId: null };
    const status = await client.query<{ status: string }>(
      `SELECT status FROM accounting.journal_entries WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
      [journalEntryId, operatingCompanyId]
    );
    if (status.rows[0]?.status !== "voided") return { idempotencyKey, liveJournalEntryId: journalEntryId };
  }
  throw new LoanPaymentPostingError(
    "LOAN_NOT_POSTABLE",
    `Loan ${loanId} payment ${paymentNumber} has exceeded ${MAX_REVISIONS} post/reverse cycles; refusing to post again`,
    { payment_number: paymentNumber }
  );
}

async function loadPostableLoan(client: DbClient, operatingCompanyId: string, loanId: string): Promise<LoanRow> {
  const res = await client.query<LoanRow>(
    `
      SELECT id::text, name, status,
             gl_liability_account_id::text, gl_interest_expense_account_id::text, payment_account_id::text
      FROM finance.loans
      WHERE operating_company_id = $1::uuid AND id = $2::uuid AND is_active = true
      LIMIT 1
      FOR UPDATE
    `,
    [operatingCompanyId, loanId]
  );
  const loan = res.rows[0];
  if (!loan) throw new LoanPaymentPostingError("LOAN_NOT_FOUND", `Loan ${loanId} not found in ${operatingCompanyId}`);
  if (loan.status === "refinanced" || loan.status === "closed") {
    throw new LoanPaymentPostingError("LOAN_NOT_POSTABLE", `Loan ${loanId} is ${loan.status}`);
  }
  if (!loan.gl_liability_account_id || !loan.payment_account_id) {
    throw new LoanPaymentPostingError(
      "ACCOUNT_MISSING",
      `Loan ${loanId} is missing gl_liability_account_id and/or payment_account_id — designate both before posting payments`,
      {
        gl_liability_account_id: loan.gl_liability_account_id,
        payment_account_id: loan.payment_account_id,
      }
    );
  }
  return loan;
}

/**
 * Post every due (due_date <= run_date), unposted scheduled payment for one loan.
 * Flag-gated (OFF => no-op). Re-runnable with no double-post.
 */
export async function postLoanPayments(
  input: { operatingCompanyId: string; loanId: string; runDate?: string },
  actor: Actor
): Promise<LoanPaymentPostingResult> {
  return withCurrentUser(actor.userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operatingCompanyId]);

    const flagOn = await isEnabled(client as never, FINANCE_HUB_AMORTIZATION_POST_FLAG_KEY, {
      operating_company_id: input.operatingCompanyId,
      user_uuid: actor.userId,
    });
    if (!flagOn) return { result: "skipped_flag_off", loan_id: input.loanId, posted_payments: [] };

    const runDate = input.runDate ?? todayIso();
    const loan = await loadPostableLoan(client, input.operatingCompanyId, input.loanId);
    const liabilityAccountId = loan.gl_liability_account_id as string;
    const paymentAccountId = loan.payment_account_id as string;

    const dueRows = await client.query<LoanAmortRow>(
      `
        SELECT id::text, payment_number, due_date::text,
               payment_cents::text, principal_cents::text, interest_cents::text
        FROM finance.loan_amortization_rows
        WHERE operating_company_id = $1::uuid AND loan_id = $2::uuid AND is_active = true
          AND posted = false AND due_date <= $3::date
        ORDER BY payment_number ASC
        FOR UPDATE
      `,
      [input.operatingCompanyId, input.loanId, runDate]
    );

    const postedPayments: PostedPayment[] = [];
    for (const row of dueRows.rows) {
      const split = {
        paymentNumber: row.payment_number,
        principalCents: Number(row.principal_cents),
        interestCents: Number(row.interest_cents),
        paymentCents: Number(row.payment_cents),
      };
      // Drift-heal: a LIVE JE already exists for this payment (row.posted got out of sync) -> re-link,
      // no re-post. A previously reversed attempt yields a fresh revision key instead.
      const { idempotencyKey, liveJournalEntryId } = await resolvePaymentIdempotency(
        client,
        input.operatingCompanyId,
        input.loanId,
        row.payment_number
      );
      let journalEntryId = liveJournalEntryId;
      if (!journalEntryId) {
        await assertOpenPeriod(client, input.operatingCompanyId, row.due_date);
        const lines: LineToPost[] = buildLoanPaymentLines(
          split,
          {
            liabilityAccountId,
            interestExpenseAccountId: loan.gl_interest_expense_account_id,
            paymentAccountId,
          },
          loan.name
        );
        assertBalanced(lines);
        journalEntryId = await insertJournalEntryHeader(
          client,
          input.operatingCompanyId,
          row.due_date,
          `Loan payment ${loan.name} payment ${row.payment_number}`,
          actor.userId
        );
        await insertBalancedPostingLines(client, {
          operatingCompanyId: input.operatingCompanyId,
          journalEntryId,
          idempotencyKey,
          sourceTransactionType: "loan_payment",
          sourceTransactionId: input.loanId,
          lines,
          links: [
            { linked_object_type: "loan", linked_object_id: input.loanId, relationship_role: "loan_payment" },
            { linked_object_type: "loan_amortization_row", linked_object_id: row.id, relationship_role: "loan_payment_period" },
          ],
        });
      }

      await client.query(
        `
          UPDATE finance.loan_amortization_rows
          SET posted = true, posted_journal_entry_id = $3::uuid, updated_at = now(), updated_by_user_id = $4::uuid
          WHERE id = $1::uuid AND operating_company_id = $2::uuid
        `,
        [row.id, input.operatingCompanyId, journalEntryId, actor.userId]
      );

      postedPayments.push({
        payment_number: row.payment_number,
        journal_entry_id: journalEntryId,
        principal_cents: split.principalCents,
        interest_cents: split.interestCents,
        payment_cents: split.paymentCents,
      });
    }

    if (postedPayments.length === 0) {
      return { result: "nothing_to_post", loan_id: input.loanId, posted_payments: [] };
    }

    // Once no active unposted payment remains the note is retired.
    const remainingRes = await client.query<{ pending: string }>(
      `SELECT COUNT(*)::text AS pending FROM finance.loan_amortization_rows
        WHERE operating_company_id = $1::uuid AND loan_id = $2::uuid AND is_active = true AND posted = false`,
      [input.operatingCompanyId, input.loanId]
    );
    if (Number(remainingRes.rows[0]?.pending ?? 0) === 0) {
      await client.query(
        `UPDATE finance.loans
            SET status = CASE WHEN status = 'active' THEN 'paid_off' ELSE status END,
                updated_at = now(), updated_by_user_id = $3::uuid
          WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
        [input.loanId, input.operatingCompanyId, actor.userId]
      );
    }

    const totals = postedPayments.reduce(
      (acc, p) => ({
        principal: acc.principal + p.principal_cents,
        interest: acc.interest + p.interest_cents,
        paid: acc.paid + p.payment_cents,
      }),
      { principal: 0, interest: 0, paid: 0 }
    );

    await appendCrudAudit(
      client as never,
      actor.userId,
      "finance.loan_payment.posted",
      {
        resource_type: "finance.loans",
        resource_id: input.loanId,
        operating_company_id: input.operatingCompanyId,
        payment_count: postedPayments.length,
        total_principal_cents: totals.principal,
        total_interest_cents: totals.interest,
        total_paid_cents: totals.paid,
        run_date: runDate,
        journal_entry_ids: postedPayments.map((p) => p.journal_entry_id),
      },
      "info",
      "FH-3-LOAN-PAYMENT-GL"
    );

    return {
      result: "posted",
      loan_id: input.loanId,
      posted_payments: postedPayments,
      payment_count: postedPayments.length,
      total_principal_cents: totals.principal,
      total_interest_cents: totals.interest,
      total_paid_cents: totals.paid,
    };
  });
}

/**
 * Reverse posted loan payments with equal-and-opposite reversing entries (shared void path — never
 * DELETE), then un-latch the schedule rows so a corrected run can re-post them.
 */
export async function reverseLoanPayments(
  input: { operatingCompanyId: string; loanId: string; reason: string; paymentNumber?: number },
  actor: Actor
): Promise<LoanPaymentReversalResult> {
  return withCurrentUser(actor.userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operatingCompanyId]);

    const loanRes = await client.query<{ name: string }>(
      `SELECT name FROM finance.loans WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
      [input.loanId, input.operatingCompanyId]
    );
    if (!loanRes.rows[0]) {
      throw new LoanPaymentPostingError("LOAN_NOT_FOUND", `Loan ${input.loanId} not found in ${input.operatingCompanyId}`);
    }
    const loanName = loanRes.rows[0].name;

    const conds = [
      "operating_company_id = $1::uuid",
      "loan_id = $2::uuid",
      "is_active = true",
      "posted = true",
      "posted_journal_entry_id IS NOT NULL",
    ];
    const params: unknown[] = [input.operatingCompanyId, input.loanId];
    if (input.paymentNumber != null) {
      conds.push(`payment_number = $3`);
      params.push(input.paymentNumber);
    }
    const rows = await client.query<{ id: string; payment_number: number; posted_journal_entry_id: string }>(
      `SELECT id::text, payment_number, posted_journal_entry_id::text
         FROM finance.loan_amortization_rows
        WHERE ${conds.join(" AND ")}
        ORDER BY payment_number ASC
        FOR UPDATE`,
      params
    );

    const reversed: LoanPaymentReversalResult["reversed_payments"] = [];
    for (const row of rows.rows) {
      const jeId = row.posted_journal_entry_id;
      const header = await client.query<{ entry_date: string; status: string }>(
        `SELECT entry_date::text, status FROM accounting.journal_entries
          WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1 FOR UPDATE`,
        [jeId, input.operatingCompanyId]
      );
      const je = header.rows[0];
      if (!je || je.status === "voided") continue; // already reversed — no double-reverse

      const reversal = await postVoidReversal(
        client as never,
        {
          operatingCompanyId: input.operatingCompanyId,
          entityType: "journal_entry",
          entityId: jeId,
          originalDate: je.entry_date,
          memo: `Void reversal of loan payment ${loanName} payment ${row.payment_number} (loan ${input.loanId}): ${input.reason}`,
        },
        { userId: actor.userId }
      );

      await client.query(
        `UPDATE accounting.journal_entries
            SET status = 'voided', voided_at = now(), voided_by_user_id = $3::uuid, void_reason = $4,
                qbo_sync_pending = true, updated_at = now()
          WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
        [jeId, input.operatingCompanyId, actor.userId, input.reason]
      );

      await client.query(
        `UPDATE finance.loan_amortization_rows
            SET posted = false, posted_journal_entry_id = NULL, updated_at = now(), updated_by_user_id = $3::uuid
          WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
        [row.id, input.operatingCompanyId, actor.userId]
      );

      reversed.push({
        payment_number: row.payment_number,
        journal_entry_id: jeId,
        reversal_journal_entry_id: reversal.reversal_journal_entry_id,
      });
    }

    if (reversed.length === 0) {
      return { result: "nothing_to_reverse", loan_id: input.loanId, reversed_payments: [] };
    }

    // A reversed payment means the note is no longer retired.
    await client.query(
      `UPDATE finance.loans
          SET status = CASE WHEN status = 'paid_off' THEN 'active' ELSE status END,
              updated_at = now(), updated_by_user_id = $3::uuid
        WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
      [input.loanId, input.operatingCompanyId, actor.userId]
    );

    await appendCrudAudit(
      client as never,
      actor.userId,
      "finance.loan_payment.reversed",
      {
        resource_type: "finance.loans",
        resource_id: input.loanId,
        operating_company_id: input.operatingCompanyId,
        void_reason: input.reason,
        reversed_payment_count: reversed.length,
        reversed_payments: reversed,
      },
      "warning",
      "FH-3-LOAN-PAYMENT-GL"
    );

    return { result: "reversed", loan_id: input.loanId, reversed_payments: reversed };
  });
}
