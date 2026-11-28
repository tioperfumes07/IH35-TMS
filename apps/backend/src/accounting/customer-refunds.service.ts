/**
 * CUSTOMER REFUNDS — owner 2026-11-27 22:40 CT ("Build refund engine (Recommended)": one refund document per credit, posting Dr the
 * customer's credit / Cr bank, with a test proving the entry). Migration 202617280100.
 *
 * QuickBooks "Refund a credit memo": the customer has credit left on a credit memo (a return, an allowance, an overpayment) and the
 * company pays it back by check / ACH / wire / card / cash from one of its bank or cash accounts.
 *   · create — one accounting.customer_refunds row, posted by the ONE posting engine (source type customer_refund: Dr ar_control /
 *     Cr the bank account's ledger), and the credit memo's unapplied amount is consumed (amount_applied_cents += refund), all on the
 *     caller's transaction — a failure anywhere rolls the whole refund back.
 *   · void — never a delete: the posting is reversed through the engine and the amount goes back to the credit memo.
 * No GL math here: the lines live in posting-engine.service.ts buildCustomerRefundLines.
 */
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { companyBusinessDate } from "../lib/company-business-date.js";
import { nextCustomerRefundDisplayId } from "./display-id.js";
import { postSourceTransactionInClientTx, reversePostedSourceTransactionInClientTx } from "./posting-engine.service.js";

export const REFUND_METHODS = ["check", "ach", "wire", "card", "cash"] as const;

export const createRefundBodySchema = z.object({
  credit_memo_id: z.string().trim().uuid(),
  bank_account_id: z.string().trim().uuid(),
  amount_cents: z.coerce.number().int().positive(),
  refund_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  method: z.enum(REFUND_METHODS),
  reference: z.string().trim().max(80).optional().nullable(),
  memo: z.string().trim().max(2000).optional().nullable(),
  idempotency_key: z.string().trim().min(8).max(200).optional(),
});
export const voidRefundBodySchema = z.object({ reason: z.string().trim().min(1).max(500) });

type Client = { query: (sql: string, values?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }> }; // eslint-disable-line @typescript-eslint/no-explicit-any
type Refusal = { code: 404 | 409 | 422; error: string; detail?: string };

const REFUND_COLUMNS = `r.id::text, r.display_id, r.customer_id::text, r.credit_memo_id::text, cm.display_id AS credit_memo_display_id,
  r.refund_date::text, r.amount_cents::bigint AS amount_cents, r.method, r.reference, r.bank_account_id::text,
  COALESCE(ba.display_name, ba.account_name) AS bank_account_name, r.bank_ledger_account_id::text, r.memo, r.journal_entry_id::text,
  r.created_at::text, r.voided_at::text, r.void_reason`;
const REFUND_FROM = `accounting.customer_refunds r
  JOIN accounting.credit_memos cm ON cm.id = r.credit_memo_id
  LEFT JOIN banking.bank_accounts ba ON ba.id = r.bank_account_id`;

function normalize(row: Record<string, unknown>) {
  return { ...row, amount_cents: Number(row.amount_cents) };
}

/** Live (not voided) refunds of one credit memo, in cents — a credit memo with any cannot be voided until its refunds are. */
export async function liveRefundCentsForCreditMemo(client: Client, operatingCompanyId: string, creditMemoId: string): Promise<number> {
  const res = await client.query(
    `SELECT COALESCE(SUM(amount_cents), 0)::bigint AS cents FROM accounting.customer_refunds
      WHERE operating_company_id = $1::uuid AND credit_memo_id = $2::uuid AND voided_at IS NULL`,
    [operatingCompanyId, creditMemoId]
  );
  return Number(res.rows[0]?.cents ?? 0);
}

export async function createCustomerRefundInClientTx(
  client: Client,
  { operatingCompanyId, userId, input }: { operatingCompanyId: string; userId: string; input: z.infer<typeof createRefundBodySchema> }
): Promise<Refusal | { code: 200 | 201; data: Record<string, unknown> }> {
  if (input.idempotency_key) {
    const prior = await client.query(
      `SELECT ${REFUND_COLUMNS} FROM ${REFUND_FROM} WHERE r.operating_company_id = $1::uuid AND r.idempotency_key = $2 LIMIT 1`,
      [operatingCompanyId, input.idempotency_key]
    );
    if (prior.rows[0]) return { code: 200, data: { refund: normalize(prior.rows[0]), replayed: true } };
  }

  const memoRes = await client.query(
    `SELECT id::text, customer_id::text, display_id, status, voided_at::text, amount_cents::bigint AS amount_cents,
            amount_applied_cents::bigint AS amount_applied_cents
       FROM accounting.credit_memos
      WHERE id = $1::uuid AND operating_company_id = $2::uuid
      LIMIT 1
      FOR UPDATE`,
    [input.credit_memo_id, operatingCompanyId]
  );
  const memo = memoRes.rows[0];
  if (!memo) return { code: 404, error: "credit_memo_not_found" };
  if (memo.voided_at || memo.status === "voided") return { code: 409, error: "credit_memo_voided" };
  const unapplied = Number(memo.amount_cents) - Number(memo.amount_applied_cents);
  if (input.amount_cents > unapplied) {
    return { code: 422, error: "refund_exceeds_credit", detail: `Credit memo ${memo.display_id} has ${unapplied} cents left; refund asks ${input.amount_cents}` };
  }

  const bankRes = await client.query(
    `SELECT id::text, ledger_account_id::text FROM banking.bank_accounts
      WHERE id = $1::uuid AND operating_company_id = $2::uuid AND deactivated_at IS NULL
      LIMIT 1`,
    [input.bank_account_id, operatingCompanyId]
  );
  const bank = bankRes.rows[0];
  if (!bank) return { code: 404, error: "bank_account_not_found" };
  if (!bank.ledger_account_id) return { code: 422, error: "bank_account_has_no_ledger_account" };

  const refundDate = input.refund_date ?? companyBusinessDate();
  const displayId = await nextCustomerRefundDisplayId(client as never, operatingCompanyId, new Date(`${refundDate}T12:00:00Z`));
  const ins = await client.query(
    `INSERT INTO accounting.customer_refunds
       (operating_company_id, display_id, customer_id, credit_memo_id, refund_date, amount_cents, method, reference,
        bank_account_id, bank_ledger_account_id, memo, idempotency_key, created_by_user_id)
     VALUES ($1::uuid, $2, $3::uuid, $4::uuid, $5::date, $6, $7, $8, $9::uuid, $10::uuid, $11, $12, $13::uuid)
     RETURNING id::text`,
    [operatingCompanyId, displayId, memo.customer_id, memo.id, refundDate, input.amount_cents, input.method, input.reference?.trim() || null,
      bank.id, bank.ledger_account_id, input.memo?.trim() || null, input.idempotency_key ?? null, userId]
  );
  const refundId = String(ins.rows[0]?.id ?? "");

  // THE posting (same transaction): Dr A/R (the customer's credit cleared) / Cr the bank the money left from.
  const posting = await postSourceTransactionInClientTx(
    client as never,
    { operating_company_id: operatingCompanyId, source_transaction_type: "customer_refund", source_transaction_id: refundId },
    { userId }
  );
  const jeId = (posting as { journal_entry_id?: string | null })?.journal_entry_id ?? null;
  if (!jeId) throw new Error("customer_refund_not_posted: the posting engine returned no journal entry");
  await client.query(`UPDATE accounting.customer_refunds SET journal_entry_id = $2::uuid WHERE id = $1::uuid`, [refundId, jeId]);

  // The credit is used up by the refund — it can never be applied to an invoice AND refunded (credit_memos_check caps it).
  await client.query(
    `UPDATE accounting.credit_memos
        SET amount_applied_cents = amount_applied_cents + $2,
            status = CASE WHEN amount_applied_cents + $2 >= amount_cents THEN 'applied' ELSE status END
      WHERE id = $1::uuid`,
    [memo.id, input.amount_cents]
  );

  await appendCrudAudit(
    client as never,
    userId,
    "accounting.customer_refund.created",
    { resource_type: "accounting.customer_refunds", resource_id: refundId, credit_memo_id: memo.id, amount_cents: input.amount_cents,
      method: input.method, bank_account_id: bank.id, journal_entry_id: jeId },
    "info",
    "CUSTOMER-REFUNDS"
  );

  const out = await client.query(`SELECT ${REFUND_COLUMNS} FROM ${REFUND_FROM} WHERE r.id = $1::uuid`, [refundId]);
  return { code: 201, data: { refund: normalize(out.rows[0]) } };
}

export async function voidCustomerRefundInClientTx(
  client: Client,
  { operatingCompanyId, userId, refundId, reason }: { operatingCompanyId: string; userId: string; refundId: string; reason: string }
): Promise<Refusal | { code: 200; data: Record<string, unknown> }> {
  const res = await client.query(
    `SELECT id::text, credit_memo_id::text, amount_cents::bigint AS amount_cents, voided_at::text
       FROM accounting.customer_refunds WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1 FOR UPDATE`,
    [refundId, operatingCompanyId]
  );
  const refund = res.rows[0];
  if (!refund) return { code: 404, error: "refund_not_found" };
  if (refund.voided_at) return { code: 409, error: "already_voided" };

  const rev = await reversePostedSourceTransactionInClientTx(
    client as never,
    { operating_company_id: operatingCompanyId, source_transaction_type: "customer_refund", source_transaction_id: refundId },
    { userId },
    companyBusinessDate()
  );
  const reversalJeId = (rev as { journal_entry_id?: string | null })?.journal_entry_id ?? null;

  await client.query(
    `UPDATE accounting.customer_refunds SET voided_at = now(), voided_by_user_id = $2::uuid, void_reason = $3 WHERE id = $1::uuid`,
    [refundId, userId, reason]
  );
  // The credit comes back to the credit memo (left to apply again).
  await client.query(
    `UPDATE accounting.credit_memos
        SET amount_applied_cents = amount_applied_cents - $2,
            status = CASE WHEN status = 'applied' AND amount_applied_cents - $2 < amount_cents THEN 'issued' ELSE status END
      WHERE id = $1::uuid AND status <> 'voided'`,
    [refund.credit_memo_id, Number(refund.amount_cents)]
  );
  await appendCrudAudit(
    client as never,
    userId,
    "accounting.customer_refund.voided",
    { resource_type: "accounting.customer_refunds", resource_id: refundId, reason, reversal_journal_entry_id: reversalJeId },
    "warning",
    "CUSTOMER-REFUNDS"
  );
  const out = await client.query(`SELECT ${REFUND_COLUMNS} FROM ${REFUND_FROM} WHERE r.id = $1::uuid`, [refundId]);
  return { code: 200, data: { refund: normalize(out.rows[0]), reversal_journal_entry_id: reversalJeId } };
}

export async function listCustomerRefunds(client: Client, operatingCompanyId: string, filter: { customerId?: string; creditMemoId?: string }) {
  const conds = ["r.operating_company_id = $1::uuid"];
  const params: unknown[] = [operatingCompanyId];
  if (filter.customerId) { params.push(filter.customerId); conds.push(`r.customer_id = $${params.length}::uuid`); }
  if (filter.creditMemoId) { params.push(filter.creditMemoId); conds.push(`r.credit_memo_id = $${params.length}::uuid`); }
  const res = await client.query(
    `SELECT ${REFUND_COLUMNS} FROM ${REFUND_FROM} WHERE ${conds.join(" AND ")} ORDER BY r.refund_date DESC, r.created_at DESC LIMIT 500`,
    params
  );
  return res.rows.map(normalize);
}
