/**
 * ROUND 312 B-2 — Bank Deposits (QBO Make Deposit).
 * Pick undeposited-funds receipts → one deposit JE (Dr bank / Cr UF) + accounting.deposits header
 * with lines linked to each receipt; optional cash-back; void = reversePostedSourceTransaction.
 */
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { nextDepositDisplayId } from "./display-id.js";
import {
  postSourceTransactionInClientTx,
  reversePostedSourceTransactionInClientTx,
  PostingEngineError,
} from "./posting-engine.service.js";
import { resolveRoleAccountOptional } from "./coa-roles/resolver.service.js";
import { releaseBankLinesNamingDocument } from "./void.service.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

export class BankDepositError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "BankDepositError";
  }
}

export type UndepositedReceipt = {
  kind: "customer_payment" | "factoring_advance";
  id: string;
  display_id: string | null;
  amount_cents: number;
  receipt_date: string | null;
  payee_name: string | null;
  memo: string | null;
};

export type CreateBankDepositInput = {
  operatingCompanyId: string;
  userId: string;
  bankAccountId: string;
  depositDate: string;
  memo?: string | null;
  referenceNumber?: string | null;
  paymentIds?: string[];
  factoringAdvanceIds?: string[];
  cashBackCents?: number;
  cashBackAccountId?: string | null;
};

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

async function withCompanyTx<T>(userId: string, operatingCompanyId: string, fn: (client: DbClient) => Promise<T>): Promise<T> {
  return withCurrentUser(userId, async (client) => {
    // ROUND 389.2 triage (verify-tenant-scope-on-routes, CODE-WRONG): an Owner's RLS admits EVERY company, so the
    // company id the caller names must be checked against the user's own membership before it scopes anything.
    await assertCompanyMembership(client as never, userId, operatingCompanyId);
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    return fn(client);
  });
}

/** Receipts sitting in Undeposited Funds / cash_clearing that are not on a live deposit and not already swept. */
export async function listUndepositedReceipts(operatingCompanyId: string, userId: string): Promise<UndepositedReceipt[]> {
  return withCompanyTx(userId, operatingCompanyId, async (client) => {
    const uf =
      (await resolveRoleAccountOptional(client, operatingCompanyId, "undeposited_funds")) ??
      (await resolveRoleAccountOptional(client, operatingCompanyId, "cash_clearing"));
    if (!uf) return [];

    const payments = await client.query<{
      id: string;
      display_id: string | null;
      amount_cents: number;
      payment_date: string | null;
      payee_name: string | null;
      memo: string | null;
    }>(
      `
      SELECT p.id::text, p.display_id, p.amount_cents::bigint, p.payment_date::text,
             c.customer_name AS payee_name, NULL::text AS memo
      FROM accounting.payments p
      LEFT JOIN mdata.customers c ON c.id = p.customer_id
      WHERE p.operating_company_id = $1::uuid
        AND p.voided_at IS NULL
        AND COALESCE(p.is_sample_data, false) IS NOT TRUE
        AND p.deposited_to_account_id = $2::uuid
        AND NOT EXISTS (
          SELECT 1 FROM accounting.deposit_lines dl
          JOIN accounting.deposits d ON d.id = dl.deposit_id
          WHERE dl.source_payment_id = p.id
            AND d.voided_at IS NULL
        )
        AND NOT EXISTS (
          SELECT 1 FROM accounting.posting_batches pb
          WHERE pb.operating_company_id = p.operating_company_id
            AND pb.source_transaction_type = 'customer_payment_deposit'
            AND pb.source_transaction_id = p.id::text
            AND pb.batch_status = 'posted'
        )
      ORDER BY p.payment_date ASC NULLS LAST, p.display_id ASC
      `,
      [operatingCompanyId, uf]
    );

    const advances = await client.query<{
      id: string;
      display_id: string | null;
      amount_cents: number;
      advanced_at: string | null;
      payee_name: string | null;
      memo: string | null;
    }>(
      `
      SELECT fa.id::text, fa.display_id,
             GREATEST(
               0,
               COALESCE(fa.invoice_total_cents, 0)
               - COALESCE(fa.reserve_amount_cents, 0)
               - COALESCE(fa.factor_fee_cents, 0)
               - COALESCE(fa.wire_fee_cents, 0)
               - COALESCE(fa.cash_rsv_cents, 0)
             )::bigint AS amount_cents,
             fa.advanced_at::text,
             'Faro'::text AS payee_name,
             fa.faro_invoice_number AS memo
      FROM accounting.factoring_advances fa
      WHERE fa.operating_company_id = $1::uuid
        AND fa.voided_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM accounting.deposit_lines dl
          JOIN accounting.deposits d ON d.id = dl.deposit_id
          WHERE dl.source_factoring_advance_id = fa.id
            AND d.voided_at IS NULL
        )
        AND NOT EXISTS (
          SELECT 1 FROM accounting.posting_batches pb
          WHERE pb.operating_company_id = fa.operating_company_id
            AND pb.source_transaction_type = 'factoring_advance_deposit'
            AND pb.source_transaction_id = fa.id::text
            AND pb.batch_status = 'posted'
        )
        AND EXISTS (
          SELECT 1 FROM accounting.journal_entry_postings jep
          WHERE jep.source_transaction_type = 'factoring_advance'
            AND jep.source_transaction_id = fa.id::text
            AND jep.account_id = $2::uuid
            AND jep.debit_or_credit = 'debit'
        )
      ORDER BY fa.advanced_at ASC NULLS LAST, fa.display_id ASC
      `,
      [operatingCompanyId, uf]
    );

    return [
      ...payments.rows.map((r) => ({
        kind: "customer_payment" as const,
        id: r.id,
        display_id: r.display_id,
        amount_cents: Number(r.amount_cents),
        receipt_date: r.payment_date,
        payee_name: r.payee_name,
        memo: r.memo,
      })),
      ...advances.rows.map((r) => ({
        kind: "factoring_advance" as const,
        id: r.id,
        display_id: r.display_id,
        amount_cents: Number(r.amount_cents),
        receipt_date: r.advanced_at?.slice(0, 10) ?? null,
        payee_name: r.payee_name,
        memo: r.memo,
      })),
    ].filter((r) => r.amount_cents > 0);
  });
}

export async function createBankDeposit(input: CreateBankDepositInput) {
  const paymentIds = [...new Set(input.paymentIds ?? [])];
  const advanceIds = [...new Set(input.factoringAdvanceIds ?? [])];
  if (paymentIds.length + advanceIds.length === 0) {
    throw new BankDepositError("NO_RECEIPTS", "Select at least one undeposited receipt");
  }
  const cashBackCents = Math.max(0, Math.trunc(input.cashBackCents ?? 0));
  if (cashBackCents > 0 && !input.cashBackAccountId) {
    throw new BankDepositError("CASH_BACK_ACCOUNT_REQUIRED", "Cash-back requires an account");
  }
  if (cashBackCents === 0 && input.cashBackAccountId) {
    throw new BankDepositError("CASH_BACK_AMOUNT_REQUIRED", "Cash-back account set without amount");
  }

  return withCompanyTx(input.userId, input.operatingCompanyId, async (client) => {
    const uf =
      (await resolveRoleAccountOptional(client, input.operatingCompanyId, "undeposited_funds")) ??
      (await resolveRoleAccountOptional(client, input.operatingCompanyId, "cash_clearing"));
    if (!uf) throw new BankDepositError("UF_UNMAPPED", "Undeposited funds role is not mapped for this company");

    const bankRes = await client.query<{ id: string; ledger_account_id: string | null }>(
      `
      SELECT id::text, ledger_account_id::text
      FROM banking.bank_accounts
      WHERE id = $1::uuid AND operating_company_id = $2::uuid AND deactivated_at IS NULL
      LIMIT 1
      FOR UPDATE
      `,
      [input.bankAccountId, input.operatingCompanyId]
    );
    const bank = bankRes.rows[0];
    if (!bank) throw new BankDepositError("BANK_NOT_FOUND", "Bank account not found");
    if (!bank.ledger_account_id) {
      throw new BankDepositError("BANK_LEDGER_MISSING", "Bank account has no ledger_account_id bridge");
    }

    type ReceiptRow = { kind: "customer_payment" | "factoring_advance"; id: string; amount_cents: number; label: string };
    const receipts: ReceiptRow[] = [];

    for (const paymentId of paymentIds) {
      const res = await client.query<{
        id: string;
        amount_cents: number;
        display_id: string | null;
        deposited_to_account_id: string | null;
        voided_at: string | null;
      }>(
        `
        SELECT id::text, amount_cents::bigint, display_id, deposited_to_account_id::text, voided_at::text
        FROM accounting.payments
        WHERE id = $1::uuid AND operating_company_id = $2::uuid
        FOR UPDATE
        `,
        [paymentId, input.operatingCompanyId]
      );
      const p = res.rows[0];
      if (!p || p.voided_at) throw new BankDepositError("PAYMENT_NOT_ELIGIBLE", `Payment ${paymentId} is missing or voided`);
      if (p.deposited_to_account_id !== uf) {
        throw new BankDepositError("PAYMENT_NOT_IN_UF", `Payment ${p.display_id ?? paymentId} is not in Undeposited Funds`);
      }
      const live = await client.query(
        `
        SELECT 1 FROM accounting.deposit_lines dl
        JOIN accounting.deposits d ON d.id = dl.deposit_id
        WHERE dl.source_payment_id = $1::uuid AND d.voided_at IS NULL
        LIMIT 1
        `,
        [paymentId]
      );
      if (live.rows[0]) throw new BankDepositError("ALREADY_DEPOSITED", `Payment ${p.display_id ?? paymentId} is already on a live deposit`);
      receipts.push({
        kind: "customer_payment",
        id: p.id,
        amount_cents: Number(p.amount_cents),
        label: p.display_id ? `Payment ${p.display_id}` : "Customer payment",
      });
    }

    for (const advanceId of advanceIds) {
      const res = await client.query<{
        id: string;
        amount_cents: number;
        display_id: string | null;
        voided_at: string | null;
      }>(
        `
        SELECT id::text,
               GREATEST(
                 0,
                 COALESCE(invoice_total_cents, 0)
                 - COALESCE(reserve_amount_cents, 0)
                 - COALESCE(factor_fee_cents, 0)
                 - COALESCE(wire_fee_cents, 0)
                 - COALESCE(cash_rsv_cents, 0)
               )::bigint AS amount_cents,
               display_id, voided_at::text
        FROM accounting.factoring_advances
        WHERE id = $1::uuid AND operating_company_id = $2::uuid
        FOR UPDATE
        `,
        [advanceId, input.operatingCompanyId]
      );
      const a = res.rows[0];
      if (!a || a.voided_at) throw new BankDepositError("ADVANCE_NOT_ELIGIBLE", `Advance ${advanceId} is missing or voided`);
      const live = await client.query(
        `
        SELECT 1 FROM accounting.deposit_lines dl
        JOIN accounting.deposits d ON d.id = dl.deposit_id
        WHERE dl.source_factoring_advance_id = $1::uuid AND d.voided_at IS NULL
        LIMIT 1
        `,
        [advanceId]
      );
      if (live.rows[0]) throw new BankDepositError("ALREADY_DEPOSITED", `Advance ${a.display_id ?? advanceId} is already on a live deposit`);
      receipts.push({
        kind: "factoring_advance",
        id: a.id,
        amount_cents: Number(a.amount_cents),
        label: a.display_id ? `Factoring ${a.display_id}` : "Factoring advance",
      });
    }

    const totalReceipts = receipts.reduce((s, r) => s + r.amount_cents, 0);
    if (cashBackCents >= totalReceipts) {
      throw new BankDepositError("CASH_BACK_TOO_LARGE", "Cash-back must be less than total receipts");
    }
    const amountDeposited = totalReceipts - cashBackCents;
    const displayId = await nextDepositDisplayId(client, input.operatingCompanyId, new Date(`${input.depositDate}T12:00:00Z`));

    const ins = await client.query<{ id: string; display_id: string }>(
      `
      INSERT INTO accounting.deposits (
        operating_company_id, display_id, deposit_date,
        bank_account_id, bank_ledger_account_id, undeposited_funds_account_id,
        total_receipts_cents, cash_back_cents, amount_deposited_cents, cash_back_account_id,
        memo, reference_number, created_by_user_id, updated_by_user_id
      ) VALUES (
        $1::uuid, $2, $3::date,
        $4::uuid, $5::uuid, $6::uuid,
        $7::bigint, $8::bigint, $9::bigint, $10::uuid,
        $11, $12, $13::uuid, $13::uuid
      )
      RETURNING id::text, display_id
      `,
      [
        input.operatingCompanyId,
        displayId,
        input.depositDate,
        input.bankAccountId,
        bank.ledger_account_id,
        uf,
        totalReceipts,
        cashBackCents,
        amountDeposited,
        cashBackCents > 0 ? input.cashBackAccountId : null,
        input.memo ?? null,
        input.referenceNumber ?? null,
        input.userId,
      ]
    );
    const deposit = ins.rows[0]!;

    let sort = 0;
    for (const r of receipts) {
      sort += 1;
      await client.query(
        `
        INSERT INTO accounting.deposit_lines (
          deposit_id, operating_company_id, line_type,
          source_payment_id, source_factoring_advance_id,
          amount_cents, description, sort_order
        ) VALUES (
          $1::uuid, $2::uuid, $3,
          $4::uuid, $5::uuid,
          $6::bigint, $7, $8
        )
        `,
        [
          deposit.id,
          input.operatingCompanyId,
          r.kind,
          r.kind === "customer_payment" ? r.id : null,
          r.kind === "factoring_advance" ? r.id : null,
          r.amount_cents,
          r.label,
          sort,
        ]
      );
    }
    if (cashBackCents > 0) {
      sort += 1;
      await client.query(
        `
        INSERT INTO accounting.deposit_lines (
          deposit_id, operating_company_id, line_type,
          amount_cents, description, sort_order
        ) VALUES ($1::uuid, $2::uuid, 'cash_back', $3::bigint, 'Cash back', $4)
        `,
        [deposit.id, input.operatingCompanyId, cashBackCents, sort]
      );
    }

    let posting;
    try {
      posting = await postSourceTransactionInClientTx(
        client,
        {
          operating_company_id: input.operatingCompanyId,
          source_transaction_type: "bank_deposit",
          source_transaction_id: deposit.id,
        },
        { userId: input.userId }
      );
    } catch (err) {
      if (err instanceof PostingEngineError) {
        throw new BankDepositError(err.code, err.message);
      }
      throw err;
    }

    await client.query(
      `
      UPDATE accounting.deposits
         SET journal_entry_id = $2::uuid,
             posting_status = 'posted',
             posted_at = now(),
             updated_at = now()
       WHERE id = $1::uuid
      `,
      [deposit.id, posting.journal_entry_id]
    );

    await appendCrudAudit(client, input.userId, "accounting.bank_deposit_created", {
      operating_company_id: input.operatingCompanyId,
      deposit_id: deposit.id,
      display_id: deposit.display_id,
      total_receipts_cents: totalReceipts,
      cash_back_cents: cashBackCents,
      amount_deposited_cents: amountDeposited,
      journal_entry_id: posting.journal_entry_id,
      receipt_count: receipts.length,
    });

    return {
      id: deposit.id,
      display_id: deposit.display_id,
      journal_entry_id: posting.journal_entry_id,
      total_receipts_cents: totalReceipts,
      cash_back_cents: cashBackCents,
      amount_deposited_cents: amountDeposited,
    };
  });
}

export async function voidBankDeposit(input: {
  operatingCompanyId: string;
  userId: string;
  depositId: string;
  reason: string;
}) {
  const reason = input.reason.trim();
  if (reason.length < 3) throw new BankDepositError("REASON_REQUIRED", "Void reason must be at least 3 characters");

  return withCompanyTx(input.userId, input.operatingCompanyId, async (client) => {
    const res = await client.query<{
      id: string;
      display_id: string;
      voided_at: string | null;
      journal_entry_id: string | null;
    }>(
      `
      SELECT id::text, display_id, voided_at::text, journal_entry_id::text
      FROM accounting.deposits
      WHERE id = $1::uuid AND operating_company_id = $2::uuid
      FOR UPDATE
      `,
      [input.depositId, input.operatingCompanyId]
    );
    const dep = res.rows[0];
    if (!dep) throw new BankDepositError("NOT_FOUND", "Deposit not found");
    if (dep.voided_at) throw new BankDepositError("ALREADY_VOIDED", "Deposit is already voided");

    let reversalJe: string | null = null;
    if (dep.journal_entry_id) {
      try {
        const rev = await reversePostedSourceTransactionInClientTx(
          client,
          {
            operating_company_id: input.operatingCompanyId,
            source_transaction_type: "bank_deposit",
            source_transaction_id: dep.id,
          },
          { userId: input.userId },
          new Date().toISOString().slice(0, 10)
        );
        reversalJe = rev.journal_entry_id;
      } catch (err) {
        if (!(err instanceof PostingEngineError && err.code === "SOURCE_NOT_FOUND")) throw err;
      }
    }

    // ROUND 373.4 / ENG-REVERSE — set-based release through the shared primitive BEFORE the deposit
    // stops being live. Per-row unmatch was a Rule 53 miss and could not run if the releaser's
    // closed list omitted matched_deposit_id. Legacy JE-only matches (pre-pointer) still release too.
    const releasedDepositLines = await releaseBankLinesNamingDocument(
      client as never,
      { operatingCompanyId: input.operatingCompanyId, pointerColumn: "matched_deposit_id", documentId: dep.id },
      { userId: input.userId, reason: `void: deposit ${dep.id}` }
    );
    const releasedJeLines = dep.journal_entry_id
      ? await releaseBankLinesNamingDocument(
          client as never,
          {
            operatingCompanyId: input.operatingCompanyId,
            pointerColumn: "matched_journal_entry_id",
            documentId: dep.journal_entry_id,
          },
          { userId: input.userId, reason: `void: deposit ${dep.id} journal ${dep.journal_entry_id}` }
        )
      : 0;

    await client.query(
      `
      UPDATE accounting.deposits
         SET voided_at = now(),
             voided_by_user_id = $2::uuid,
             void_reason = $3,
             posting_status = CASE WHEN journal_entry_id IS NOT NULL THEN 'reversed' ELSE posting_status END,
             updated_at = now(),
             updated_by_user_id = $2::uuid
       WHERE id = $1::uuid
      `,
      [dep.id, input.userId, reason]
    );

    await appendCrudAudit(client, input.userId, "accounting.bank_deposit_voided", {
      operating_company_id: input.operatingCompanyId,
      deposit_id: dep.id,
      display_id: dep.display_id,
      void_reason: reason,
      reversal_journal_entry_id: reversalJe,
      released_deposit_pointer_lines: releasedDepositLines,
      released_journal_pointer_lines: releasedJeLines,
    });

    return { id: dep.id, display_id: dep.display_id, reversal_journal_entry_id: reversalJe };
  });
}

export async function getBankDeposit(operatingCompanyId: string, userId: string, depositId: string) {
  return withCompanyTx(userId, operatingCompanyId, async (client) => {
    const header = await client.query(
      `
      SELECT d.*, ba.account_name AS bank_account_name,
             bt.id::text AS matched_bank_transaction_id,
             bt.transaction_date AS matched_bank_transaction_date,
             COALESCE(NULLIF(bt.merchant_name, ''), NULLIF(bt.description, '')) AS matched_bank_transaction_description,
             bt.amount_cents::text AS matched_bank_transaction_amount_cents
      FROM accounting.deposits d
      LEFT JOIN banking.bank_accounts ba ON ba.id = d.bank_account_id
      LEFT JOIN LATERAL (
        SELECT id, transaction_date, merchant_name, description, amount_cents
          FROM banking.bank_transactions
         WHERE operating_company_id = d.operating_company_id
           -- ROUND 373.4: the bank line matched to this deposit (matched_deposit_id); the JE form is the legacy match.
           AND (matched_deposit_id = d.id OR (d.journal_entry_id IS NOT NULL AND matched_journal_entry_id = d.journal_entry_id))
         ORDER BY transaction_date DESC, created_at DESC
         LIMIT 1
      ) bt ON TRUE
      WHERE d.id = $1::uuid AND d.operating_company_id = $2::uuid
      `,
      [depositId, operatingCompanyId]
    );
    if (!header.rows[0]) return null;
    const lines = await client.query(
      `
      SELECT dl.id::text, dl.line_type, dl.amount_cents::bigint AS amount_cents, dl.description AS memo,
             dl.source_payment_id::text AS source_payment_id,
             dl.source_factoring_advance_id::text AS source_factoring_advance_id,
             p.display_id AS payment_display_id,
             p.customer_id::text AS customer_id,
             COALESCE(c.customer_name, mdata.resolve_customer_label_same_company(p.customer_id, p.operating_company_id)) AS customer_name,
             inv.id::text AS invoice_id,
             inv.display_id AS invoice_display_id,
             COALESCE(inv.source_load_id, fa.source_load_id)::text AS load_id,
             l.load_number AS load_number,
             fa.display_id AS factoring_advance_display_id,
             fa.faro_invoice_number AS faro_invoice_number
        FROM accounting.deposit_lines dl
        LEFT JOIN accounting.payments p
          ON p.id = dl.source_payment_id AND p.operating_company_id = $2::uuid
        LEFT JOIN mdata.customers c
          ON c.id = p.customer_id AND c.operating_company_id = p.operating_company_id
        LEFT JOIN LATERAL (
          SELECT pa.invoice_id
            FROM accounting.payment_applications pa
           WHERE pa.payment_id = p.id AND pa.unapplied_at IS NULL
           ORDER BY pa.applied_at ASC, pa.id ASC
           LIMIT 1
        ) pa0 ON TRUE
        LEFT JOIN accounting.invoices inv
          ON inv.id = pa0.invoice_id AND inv.operating_company_id = $2::uuid
        LEFT JOIN accounting.factoring_advances fa
          ON fa.id = dl.source_factoring_advance_id AND fa.operating_company_id = $2::uuid
        LEFT JOIN mdata.loads l
          ON l.id = COALESCE(inv.source_load_id, fa.source_load_id)
         AND l.operating_company_id = $2::uuid
       WHERE dl.deposit_id = $1::uuid
       ORDER BY dl.sort_order ASC, dl.created_at ASC
      `,
      [depositId, operatingCompanyId]
    );
    return { ...header.rows[0], lines: lines.rows };
  });
}

export async function listBankDeposits(
  operatingCompanyId: string,
  userId: string,
  opts: { limit?: number; offset?: number; includeVoided?: boolean } = {}
) {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);
  return withCompanyTx(userId, operatingCompanyId, async (client) => {
    const res = await client.query(
      `
      SELECT d.id::text, d.display_id, d.deposit_date::text, d.total_receipts_cents::bigint,
             d.cash_back_cents::bigint, d.amount_deposited_cents::bigint,
             d.voided_at::text, d.journal_entry_id::text, d.memo,
             ba.account_name AS bank_account_name
      FROM accounting.deposits d
      LEFT JOIN banking.bank_accounts ba ON ba.id = d.bank_account_id
      WHERE d.operating_company_id = $1::uuid
        AND ($2::boolean OR d.voided_at IS NULL)
      ORDER BY d.deposit_date DESC, d.display_id DESC
      LIMIT $3 OFFSET $4
      `,
      [operatingCompanyId, Boolean(opts.includeVoided), limit, offset]
    );
    return res.rows;
  });
}
