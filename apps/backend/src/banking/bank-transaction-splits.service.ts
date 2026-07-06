// [HOLD-FOR-JORGE — TIER 1] BANK-SPLIT-1 — QBO-style Split-transaction persistence + linkage + posting.
//
// Extends the existing single-line categorize workflow (categorization.routes.ts, BLOCK-6/6b) with a real
// multi-line split model. The prior split endpoint (banking.routes.ts POST /transactions/:id/split)
// honestly returned 501 — there was no persisted split-lines table. This service is the real thing,
// backed by banking.bank_transaction_splits (migration 202607110100, HELD).
//
// FULL DOWNSTREAM LINEAGE ON COMMIT (behind BANK_TX_SPLIT_GL_POSTING_ENABLED, OFF by default) — every
// branch REUSES an existing, already-shipped writer parameterized on the split line's own amount, never new
// GL math:
//   DRIVER CASH-ADVANCE line (driver tagged + the entity's driver-advance receivable account chosen):
//     1) ASSET — createEmployeeLoanCore + disburseDriverAdvanceCore (BLOCK-6, bank-driver-advance.service.ts,
//        unmodified) books driver_liabilities + driver_advances and posts DEBIT driver-advance receivable /
//        CREDIT bank via the existing posting engine.
//     2) RECOVERY — createSettlementDeduction (driver-finance/deductions.service.ts, the SAME canonical
//        writer BLOCK-6b's bank-driver-expense-deduction.service.ts already calls) with
//        sourceType:'cash_advance_repayment' — a value that already exists in
//        SettlementDeductionSourceType specifically for this case — creates the
//        driver_finance.driver_settlement_deductions row that recovers this advance from the driver's next
//        settlement (PAY-FIRST, 5% net-pay-floor, consent-gated — all enforced downstream by the FIN-18
//        settlement poster, none of that math invented here). load_id carried DIRECTLY on the deduction
//        when the line is load-tagged (load_id-direct rule, C1-1/C1-2).
//     3) LINEAGE — bank txn -> split line -> (result_driver_advance_id, result_deduction_id,
//        result_journal_entry_id) -> the settlement that eventually clears the deduction. Forward via these
//        columns; reverse via getSplitLinesByLinkage() (query by driver/unit/trailer/load/vendor).
//   VENDOR + CATEGORY line (e.g. NAPA $200, AutoZone $300 — no driver-advance branch):
//     REUSES the exact accounting.bills INSERT shape already used by bulkPostTransactionsAsBills
//     (bulk-transactions.ts "Post as bill") — same columns, same values pattern, invoked once per line with
//     that line's own amount. Requires vendor_id (bills always have a payee, same rule as the whole-txn
//     bulk-post-as-bill path). No new GL math: accounting.bills carries no journal_entry_id — creating one
//     books a payable, it does not post to the ledger. result_bill_id (forward) + accounting.bills.
//     source_bank_transaction_id (reverse, migration 202607110100) close the loop.
//   Neither branch eligible (no vendor, no driver-advance) -> posting_status='skipped_pending_gl_wiring'.
//
// FLAGS (both OFF by default — lib.feature_flags):
//   BANK_TX_SPLIT_ENABLED           — gates persist/commit/void of a split (reads are free).
//   BANK_TX_SPLIT_GL_POSTING_ENABLED — gates the two reused per-line posting branches above.

import { withCompanyScope } from "../accounting/shared.js";
import { isEnabled } from "../lib/feature-flags/service.js";
import {
  resolveAccountForCategory,
  ExpenseCategoryMapResolutionError,
} from "../accounting/expense-category-map/resolver.service.js";
import { createEmployeeLoanCore } from "../cash-advances/cash-advance-create.js";
import { disburseDriverAdvanceCore } from "../cash-advances/cash-advance-disburse.js";
import { createSettlementDeduction } from "../driver-finance/deductions.service.js";
import { appendCrudAudit } from "../audit/crud-audit.js";

export const BANK_TX_SPLIT_FLAG_KEY = "BANK_TX_SPLIT_ENABLED";
export const BANK_TX_SPLIT_GL_POSTING_FLAG_KEY = "BANK_TX_SPLIT_GL_POSTING_ENABLED";

export type SplitMode = "single_vendor_multi_category" | "multi_vendor";

export type SplitLineInput = {
  amount_cents: number;
  category_kind?: string | null;
  gl_account_id?: string | null;
  vendor_id?: string | null;
  customer_id?: string | null;
  driver_id?: string | null;
  unit_id?: string | null;
  trailer_id?: string | null;
  load_id?: string | null;
  item_id?: string | null;
  memo?: string | null;
  recover_from_driver?: boolean | null;
  recover_deduction_type?: string | null;
};

export type SplitLineRow = SplitLineInput & {
  id: string;
  bank_transaction_id: string;
  line_no: number;
  posting_status: "draft" | "posted" | "skipped_pending_gl_wiring" | "void";
  posting_reason: string | null;
  result_driver_advance_id: string | null;
  result_deduction_id: string | null;
  result_bill_id: string | null;
  result_journal_entry_id: string | null;
};

type Client = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
};

const SPLIT_LINE_SELECT_COLUMNS = `
  id::text, bank_transaction_id::text, line_no, amount_cents::bigint, category_kind,
  gl_account_id::text, vendor_id::text, customer_id::text, driver_id::text, unit_id::text,
  trailer_id::text, load_id::text, item_id::text, memo, recover_from_driver,
  recover_deduction_type, posting_status, posting_reason,
  result_driver_advance_id::text, result_deduction_id::text, result_bill_id::text, result_journal_entry_id::text
`;

export class SplitValidationError extends Error {
  constructor(
    public code:
      | "feature_disabled"
      | "bank_txn_not_found"
      | "not_pending_categorization"
      | "min_two_lines"
      | "amount_mismatch"
      | "line_amount_invalid"
      | "single_vendor_mode_requires_one_vendor",
    message: string
  ) {
    super(message);
  }
}

function normalizeMode(mode: string | null | undefined): SplitMode {
  return mode === "multi_vendor" ? "multi_vendor" : "single_vendor_multi_category";
}

/** Read-only: current split lines for a bank transaction (active, i.e. not voided). Always allowed. */
export async function getSplitLines(
  companyId: string,
  actorUserUuid: string,
  bankTransactionId: string
): Promise<{ mode: SplitMode | null; lines: SplitLineRow[]; remaining_cents: number; total_cents: number }> {
  return withCompanyScope(actorUserUuid, companyId, async (client: Client) => {
    const txnRes = await client.query<{ amount_cents: string; split_mode: string | null }>(
      `SELECT amount_cents::text, split_mode FROM banking.bank_transactions WHERE id = $1 AND operating_company_id = $2 LIMIT 1`,
      [bankTransactionId, companyId]
    );
    const txn = txnRes.rows[0];
    if (!txn) throw new SplitValidationError("bank_txn_not_found", "Bank transaction not found.");
    const totalCents = Math.abs(Number(txn.amount_cents ?? 0));

    const linesRes = await client.query<Record<string, unknown>>(
      `
        SELECT ${SPLIT_LINE_SELECT_COLUMNS}
        FROM banking.bank_transaction_splits
        WHERE bank_transaction_id = $1 AND operating_company_id = $2 AND voided_at IS NULL
        ORDER BY line_no ASC
      `,
      [bankTransactionId, companyId]
    );
    const lines = linesRes.rows as unknown as SplitLineRow[];
    const sum = lines.reduce((acc, l) => acc + Number(l.amount_cents ?? 0), 0);
    return {
      mode: normalizeMode(txn.split_mode),
      lines,
      remaining_cents: totalCents - sum,
      total_cents: totalCents,
    };
  });
}

/**
 * REVERSE drill-through: given exactly one of driver_id/unit_id/trailer_id/load_id/vendor_id, list every
 * split line tagged to it (+ its parent bank transaction + whatever it produced — advance/deduction/bill).
 * Mirrors the shape of the single-line categorize's by-linkage endpoint (BLOCK-6b), generalized to splits.
 */
export async function getSplitLinesByLinkage(
  companyId: string,
  actorUserUuid: string,
  linkage: { driver_id?: string; unit_id?: string; trailer_id?: string; load_id?: string; vendor_id?: string },
  limit = 200
): Promise<Array<Record<string, unknown>>> {
  return withCompanyScope(actorUserUuid, companyId, async (client: Client) => {
    const res = await client.query(
      `
        SELECT
          s.id::text AS split_line_id,
          s.bank_transaction_id::text,
          bt.transaction_date::text AS transaction_date,
          bt.description,
          bt.is_credit,
          s.line_no,
          s.amount_cents::bigint,
          s.category_kind,
          s.gl_account_id::text,
          s.vendor_id::text,
          s.driver_id::text,
          s.unit_id::text,
          s.trailer_id::text,
          s.load_id::text,
          s.posting_status,
          s.posting_reason,
          s.result_driver_advance_id::text,
          s.result_deduction_id::text,
          s.result_bill_id::text,
          s.result_journal_entry_id::text
        FROM banking.bank_transaction_splits s
        JOIN banking.bank_transactions bt ON bt.id = s.bank_transaction_id AND bt.operating_company_id = s.operating_company_id
        WHERE s.operating_company_id = $1
          AND s.voided_at IS NULL
          AND (
            ($2::uuid IS NOT NULL AND s.driver_id = $2::uuid)
            OR ($3::uuid IS NOT NULL AND s.unit_id = $3::uuid)
            OR ($4::uuid IS NOT NULL AND s.trailer_id = $4::uuid)
            OR ($5::uuid IS NOT NULL AND s.load_id = $5::uuid)
            OR ($6::uuid IS NOT NULL AND s.vendor_id = $6::uuid)
          )
        ORDER BY bt.transaction_date DESC, s.line_no ASC
        LIMIT $7
      `,
      [companyId, linkage.driver_id ?? null, linkage.unit_id ?? null, linkage.trailer_id ?? null, linkage.load_id ?? null, linkage.vendor_id ?? null, limit]
    );
    return res.rows;
  });
}

/**
 * Persist (replace) the draft split lines for a transaction. Validates:
 *   - the transaction is pending categorization (a categorized/transferred/skipped row can't be split),
 *   - at least 2 lines, each amount > 0,
 *   - lines sum EXACTLY to abs(amount_cents),
 *   - in single_vendor_multi_category mode, every line shares the same vendor_id (or none).
 * Old active lines are voided (void-not-delete) and replaced with fresh rows so line_no stays 1..N.
 */
export async function saveSplitDraft(
  companyId: string,
  actorUserUuid: string,
  bankTransactionId: string,
  mode: SplitMode,
  lines: SplitLineInput[]
): Promise<{ ok: true; remaining_cents: number }> {
  return withCompanyScope(actorUserUuid, companyId, async (client: Client) => {
    const flagOn = await isEnabled(client as never, BANK_TX_SPLIT_FLAG_KEY, {
      operating_company_id: companyId,
      user_uuid: actorUserUuid,
    });
    if (!flagOn) throw new SplitValidationError("feature_disabled", "Bank transaction split is not enabled for this entity yet.");

    const txnRes = await client.query<{ amount_cents: string; status: string | null }>(
      `SELECT amount_cents::text, status FROM banking.bank_transactions WHERE id = $1 AND operating_company_id = $2 LIMIT 1`,
      [bankTransactionId, companyId]
    );
    const txn = txnRes.rows[0];
    if (!txn) throw new SplitValidationError("bank_txn_not_found", "Bank transaction not found.");
    const st = String(txn.status ?? "");
    if (st !== "pending_categorization" && st !== "uncategorized" && st !== "split") {
      throw new SplitValidationError("not_pending_categorization", "Only a not-yet-categorized transaction can be split.");
    }

    if (lines.length < 2) throw new SplitValidationError("min_two_lines", "A split needs at least 2 lines.");
    for (const l of lines) {
      if (!Number.isFinite(l.amount_cents) || l.amount_cents <= 0) {
        throw new SplitValidationError("line_amount_invalid", "Every split line amount must be a positive number.");
      }
    }
    const totalCents = Math.abs(Number(txn.amount_cents ?? 0));
    const sum = lines.reduce((acc, l) => acc + Math.round(l.amount_cents), 0);
    if (sum !== totalCents) {
      throw new SplitValidationError(
        "amount_mismatch",
        `Split lines total ${sum} cents but the transaction is ${totalCents} cents. Lines must sum exactly to the transaction amount.`
      );
    }
    if (mode === "single_vendor_multi_category") {
      const vendorIds = new Set(lines.map((l) => l.vendor_id ?? "").filter((v) => v));
      if (vendorIds.size > 1) {
        throw new SplitValidationError(
          "single_vendor_mode_requires_one_vendor",
          "Single-vendor mode requires every line to share the same vendor. Switch to multiple-vendors mode to use different vendors per line."
        );
      }
    }

    // Void-not-delete: retire any existing active lines, then insert the fresh set.
    await client.query(
      `UPDATE banking.bank_transaction_splits SET voided_at = now(), updated_at = now(), updated_by_user_id = $3
       WHERE bank_transaction_id = $1 AND operating_company_id = $2 AND voided_at IS NULL`,
      [bankTransactionId, companyId, actorUserUuid]
    );

    let lineNo = 1;
    for (const l of lines) {
      await client.query(
        `
          INSERT INTO banking.bank_transaction_splits (
            operating_company_id, bank_transaction_id, line_no, amount_cents, category_kind, gl_account_id,
            vendor_id, customer_id, driver_id, unit_id, trailer_id, load_id, item_id, memo,
            recover_from_driver, recover_deduction_type, created_by_user_id, updated_by_user_id
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$17)
        `,
        [
          companyId,
          bankTransactionId,
          lineNo,
          Math.round(l.amount_cents),
          l.category_kind ?? null,
          l.gl_account_id ?? null,
          l.vendor_id ?? null,
          l.customer_id ?? null,
          l.driver_id ?? null,
          l.unit_id ?? null,
          l.trailer_id ?? null,
          l.load_id ?? null,
          l.item_id ?? null,
          l.memo ?? null,
          Boolean(l.recover_from_driver),
          l.recover_deduction_type ?? null,
          actorUserUuid,
        ]
      );
      lineNo += 1;
    }

    await client.query(
      `UPDATE banking.bank_transactions SET split_mode = $2, updated_at = now() WHERE id = $1 AND operating_company_id = $3`,
      [bankTransactionId, mode, companyId]
    );

    await appendCrudAudit(
      client as never,
      actorUserUuid,
      "banking.transaction.split.draft_saved",
      { resource_type: "banking.bank_transactions", resource_id: bankTransactionId, operating_company_id: companyId, line_count: lines.length, mode },
      "info",
      "BANK-SPLIT-1"
    );

    return { ok: true, remaining_cents: totalCents - sum };
  });
}

type LineCommitResult = {
  line_no: number;
  posted: boolean;
  reason: string;
  driver_advance_id?: string;
  deduction_id?: string;
  bill_id?: string;
  journal_entry_id?: string;
};

/**
 * Commit the saved split: flips the parent transaction to status='split' and, per line, attempts the
 * eligible reused posting branch (driver cash-advance + recovery deduction, OR vendor bill) behind
 * BANK_TX_SPLIT_GL_POSTING_ENABLED. A line with neither a driver-advance nor a vendor commits as
 * 'skipped_pending_gl_wiring' (tags saved, nothing posted) — see module header.
 */
export async function commitSplit(
  companyId: string,
  actorUserUuid: string,
  actorRole: string,
  bankTransactionId: string
): Promise<{ ok: true; results: LineCommitResult[] }> {
  const results: LineCommitResult[] = [];

  const { lines, txnIsCredit, txnPostingDate, bankLedgerAccountId } = await withCompanyScope(
    actorUserUuid,
    companyId,
    async (client: Client) => {
      const flagOn = await isEnabled(client as never, BANK_TX_SPLIT_FLAG_KEY, {
        operating_company_id: companyId,
        user_uuid: actorUserUuid,
      });
      if (!flagOn) throw new SplitValidationError("feature_disabled", "Bank transaction split is not enabled for this entity yet.");

      const txnRes = await client.query<{
        is_credit: boolean;
        transaction_date: string;
        bank_ledger_account_id: string | null;
      }>(
        `
          SELECT bt.is_credit, bt.transaction_date::text,
                 ba.ledger_account_id::text AS bank_ledger_account_id
          FROM banking.bank_transactions bt
          LEFT JOIN banking.bank_accounts ba ON ba.id = bt.bank_account_id AND ba.operating_company_id = bt.operating_company_id
          WHERE bt.id = $1 AND bt.operating_company_id = $2
          LIMIT 1
        `,
        [bankTransactionId, companyId]
      );
      const txn = txnRes.rows[0];
      if (!txn) throw new SplitValidationError("bank_txn_not_found", "Bank transaction not found.");

      const linesRes = await client.query<{
        line_no: number;
        amount_cents: string;
        driver_id: string | null;
        vendor_id: string | null;
        gl_account_id: string | null;
        load_id: string | null;
        category_kind: string | null;
      }>(
        `
          SELECT line_no, amount_cents::text, driver_id::text, vendor_id::text, gl_account_id::text,
                 load_id::text, category_kind
          FROM banking.bank_transaction_splits
          WHERE bank_transaction_id = $1 AND operating_company_id = $2 AND voided_at IS NULL
          ORDER BY line_no ASC
        `,
        [bankTransactionId, companyId]
      );
      if (linesRes.rows.length < 2) {
        throw new SplitValidationError("min_two_lines", "Save at least 2 split lines before committing.");
      }

      await client.query(
        `UPDATE banking.bank_transactions
         SET status = 'split', category = 'split_transaction', category_kind = 'split_transaction',
             categorized_at = now(), updated_at = now()
         WHERE id = $1 AND operating_company_id = $2`,
        [bankTransactionId, companyId]
      );

      return {
        lines: linesRes.rows,
        txnIsCredit: txn.is_credit,
        txnPostingDate: txn.transaction_date,
        bankLedgerAccountId: txn.bank_ledger_account_id,
      };
    }
  );

  // Resolve the entity's driver-advance receivable account once (used to decide the cash-advance branch).
  let driverAdvanceAccountId: string | null = null;
  try {
    const mapped = await resolveAccountForCategory(companyId, "cash_advance", "cash_advance");
    driverAdvanceAccountId = mapped.account_id;
  } catch (err) {
    if (!(err instanceof ExpenseCategoryMapResolutionError)) throw err;
    driverAdvanceAccountId = null;
  }

  const glPostingFlagOn = await withCompanyScope(actorUserUuid, companyId, (client: Client) =>
    isEnabled(client as never, BANK_TX_SPLIT_GL_POSTING_FLAG_KEY, {
      operating_company_id: companyId,
      user_uuid: actorUserUuid,
    })
  );

  for (const line of lines) {
    const amountCents = Math.abs(Number(line.amount_cents ?? 0));
    const isCashAdvanceLine =
      Boolean(line.driver_id) && Boolean(driverAdvanceAccountId) && line.gl_account_id === driverAdvanceAccountId;
    const isVendorBillLine = !isCashAdvanceLine && Boolean(line.vendor_id);

    if (!glPostingFlagOn) {
      await markLineOutcome(companyId, actorUserUuid, bankTransactionId, line.line_no, {
        posting_status: "skipped_pending_gl_wiring",
        posting_reason: "flag_off",
      });
      results.push({ line_no: line.line_no, posted: false, reason: "flag_off" });
      continue;
    }

    if (isCashAdvanceLine) {
      if (txnIsCredit) {
        // A cash advance is money OUT; a credit split (money in) can't be a disbursement.
        await markLineOutcome(companyId, actorUserUuid, bankTransactionId, line.line_no, {
          posting_status: "skipped_pending_gl_wiring",
          posting_reason: "not_a_debit",
        });
        results.push({ line_no: line.line_no, posted: false, reason: "not_a_debit" });
        continue;
      }
      if (amountCents <= 0) {
        results.push({ line_no: line.line_no, posted: false, reason: "zero_amount" });
        continue;
      }

      // 1) ASSET — REUSE (unmodified): the exact BLOCK-6 two-phase call, parameterized on this line's own
      //    amount (createEmployeeLoanCore books the receivable + driver_advances row; disburseDriverAdvanceCore
      //    posts the balanced JE debiting the driver-advance receivable / crediting the bank).
      const created = await withCompanyScope(actorUserUuid, companyId, (client: Client) =>
        createEmployeeLoanCore(client as never, actorUserUuid, companyId, {
          driver_id: line.driver_id as string,
          amount: amountCents / 100,
          purpose: "other",
          disbursement_method: "direct_bank_transfer",
          recipient_info: {
            recipient_type: "driver",
            recipient_name: null,
            notes: `Bank-split-categorized driver advance (bank_txn ${bankTransactionId}, line ${line.line_no})`,
          },
          repayment_schedule: { weekly_installment_amount: amountCents / 100, total_periods: 1, cadence: "weekly" },
        })
      );
      if (!created.ok) {
        results.push({ line_no: line.line_no, posted: false, reason: `disburse_failed:${created.error}` });
        continue;
      }
      const disb = await disburseDriverAdvanceCore(actorUserUuid, actorRole, companyId, {
        advance_id: created.advanceId,
        posting_date: txnPostingDate,
        credit_account_id: bankLedgerAccountId,
      });
      if (!disb.ok) {
        results.push({ line_no: line.line_no, posted: false, reason: `disburse_failed:${disb.error}` });
        continue;
      }

      // 2) RECOVERY — REUSE createSettlementDeduction (the SAME canonical writer BLOCK-6b already calls)
      //    with sourceType:'cash_advance_repayment' so this advance is recovered from the driver's next
      //    settlement (PAY-FIRST + 5%-floor + consent enforced downstream by FIN-18; load_id-direct when
      //    the line is load-tagged). A failure here does NOT roll back the already-committed advance
      //    (the receivable is real and correctly posted either way) — it is surfaced, never swallowed.
      let deductionId: string | null = null;
      try {
        const deduction = await withCompanyScope(actorUserUuid, companyId, (client: Client) =>
          createSettlementDeduction(client as never, {
            driverId: line.driver_id as string,
            operatingCompanyId: companyId,
            amountCents,
            reason: `Bank-split driver cash-advance recovery (bank_txn ${bankTransactionId}, line ${line.line_no})`,
            sourceType: "cash_advance_repayment",
            loadId: line.load_id ?? null,
            sourceBankTransactionId: bankTransactionId,
            createdByUserId: actorUserUuid,
          })
        );
        deductionId = deduction.id;
      } catch (err) {
        results.push({
          line_no: line.line_no,
          posted: true,
          reason: `advance_posted_deduction_failed:${String((err as Error)?.message ?? err)}`,
          driver_advance_id: created.advanceId,
          journal_entry_id: disb.posting?.journal_entry_id,
        });
        await markLineOutcome(companyId, actorUserUuid, bankTransactionId, line.line_no, {
          posting_status: "posted",
          posting_reason: "advance_posted_deduction_failed",
          result_driver_advance_id: created.advanceId,
          result_journal_entry_id: disb.posting?.journal_entry_id ?? null,
        });
        continue;
      }

      await markLineOutcome(companyId, actorUserUuid, bankTransactionId, line.line_no, {
        posting_status: "posted",
        posting_reason: null,
        result_driver_advance_id: created.advanceId,
        result_deduction_id: deductionId,
        result_journal_entry_id: disb.posting?.journal_entry_id ?? null,
      });
      results.push({
        line_no: line.line_no,
        posted: true,
        reason: "posted",
        driver_advance_id: created.advanceId,
        deduction_id: deductionId,
        journal_entry_id: disb.posting?.journal_entry_id,
      });
      continue;
    }

    if (isVendorBillLine) {
      if (amountCents <= 0) {
        results.push({ line_no: line.line_no, posted: false, reason: "zero_amount" });
        continue;
      }
      // REUSE: the exact accounting.bills INSERT shape from bulkPostTransactionsAsBills ("Post as bill"),
      // invoked per line instead of per whole transaction. Booking a payable — no journal_entry_id on
      // accounting.bills, so this is not GL posting.
      const billId = await withCompanyScope(actorUserUuid, companyId, async (client: Client) => {
        const billRes = await client.query<{ id: string }>(
          `
            INSERT INTO accounting.bills (
              operating_company_id, vendor_id, vendor_uuid, bill_date, due_date, amount_cents, total_amount,
              paid_cents, paid_amount, status, memo, coa_account_id, source_bank_transaction_id,
              created_by_user_id, created_at, updated_at
            )
            VALUES ($1,$2,$2,$3,$3,$4,$5,0,0,'unpaid',$6,$7,$8,$9,now(),now())
            RETURNING id::text
          `,
          [
            companyId,
            line.vendor_id,
            txnPostingDate,
            amountCents,
            amountCents / 100,
            JSON.stringify({
              source: "bank_tx_split",
              bank_transaction_id: bankTransactionId,
              split_line_no: line.line_no,
              category_kind: line.category_kind,
            }),
            line.gl_account_id,
            bankTransactionId,
            actorUserUuid,
          ]
        );
        return billRes.rows[0]?.id ?? null;
      });
      if (!billId) {
        results.push({ line_no: line.line_no, posted: false, reason: "bill_insert_failed" });
        continue;
      }
      await markLineOutcome(companyId, actorUserUuid, bankTransactionId, line.line_no, {
        posting_status: "posted",
        posting_reason: null,
        result_bill_id: billId,
      });
      results.push({ line_no: line.line_no, posted: true, reason: "posted", bill_id: billId });
      continue;
    }

    // Neither branch eligible (no vendor tagged, not a driver-advance line) — tags stay, nothing posted.
    await markLineOutcome(companyId, actorUserUuid, bankTransactionId, line.line_no, {
      posting_status: "skipped_pending_gl_wiring",
      posting_reason: "no_vendor_or_driver_advance_account",
    });
    results.push({ line_no: line.line_no, posted: false, reason: "no_vendor_or_driver_advance_account" });
  }

  await withCompanyScope(actorUserUuid, companyId, (client: Client) =>
    appendCrudAudit(
      client as never,
      actorUserUuid,
      "banking.transaction.split.committed",
      {
        resource_type: "banking.bank_transactions",
        resource_id: bankTransactionId,
        operating_company_id: companyId,
        posted_lines: results.filter((r) => r.posted).length,
        total_lines: results.length,
      },
      "info",
      "BANK-SPLIT-1"
    )
  );

  return { ok: true, results };
}

async function markLineOutcome(
  companyId: string,
  actorUserUuid: string,
  bankTransactionId: string,
  lineNo: number,
  patch: {
    posting_status: "draft" | "posted" | "skipped_pending_gl_wiring" | "void";
    posting_reason: string | null;
    result_driver_advance_id?: string | null;
    result_deduction_id?: string | null;
    result_bill_id?: string | null;
    result_journal_entry_id?: string | null;
  }
) {
  await withCompanyScope(actorUserUuid, companyId, (client: Client) =>
    client.query(
      `
        UPDATE banking.bank_transaction_splits
        SET posting_status = $4, posting_reason = $5,
            result_driver_advance_id = COALESCE($6, result_driver_advance_id),
            result_deduction_id = COALESCE($7, result_deduction_id),
            result_bill_id = COALESCE($8, result_bill_id),
            result_journal_entry_id = COALESCE($9, result_journal_entry_id),
            updated_at = now(), updated_by_user_id = $3
        WHERE bank_transaction_id = $1 AND operating_company_id = $2 AND line_no = $10 AND voided_at IS NULL
      `,
      [
        bankTransactionId,
        companyId,
        actorUserUuid,
        patch.posting_status,
        patch.posting_reason,
        patch.result_driver_advance_id ?? null,
        patch.result_deduction_id ?? null,
        patch.result_bill_id ?? null,
        patch.result_journal_entry_id ?? null,
        lineNo,
      ]
    )
  );
}

/** Void-not-delete: retire the split lines and revert the parent transaction to pending_categorization. */
export async function voidSplit(companyId: string, actorUserUuid: string, bankTransactionId: string): Promise<{ ok: true }> {
  return withCompanyScope(actorUserUuid, companyId, async (client: Client) => {
    await client.query(
      `UPDATE banking.bank_transaction_splits
       SET voided_at = now(), posting_status = 'void', updated_at = now(), updated_by_user_id = $3
       WHERE bank_transaction_id = $1 AND operating_company_id = $2 AND voided_at IS NULL`,
      [bankTransactionId, companyId, actorUserUuid]
    );
    await client.query(
      `UPDATE banking.bank_transactions
       SET status = 'pending_categorization', category = NULL, category_kind = NULL, split_mode = NULL,
           categorized_at = NULL, updated_at = now()
       WHERE id = $1 AND operating_company_id = $2`,
      [bankTransactionId, companyId]
    );
    await appendCrudAudit(
      client as never,
      actorUserUuid,
      "banking.transaction.split.voided",
      { resource_type: "banking.bank_transactions", resource_id: bankTransactionId, operating_company_id: companyId },
      "info",
      "BANK-SPLIT-1"
    );
    return { ok: true as const };
  });
}
