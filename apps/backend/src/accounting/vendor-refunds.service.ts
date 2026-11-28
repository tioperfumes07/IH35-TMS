/**
 * VENDOR REFUNDS — mirror of customer-refunds.service.ts (owner 2026-11-27 22:40 CT "Build refund engine"; 22:54 CT "all and total
 * wiring … ar ap"). Migration 202617290100.
 *
 * QuickBooks "Deposit a vendor refund": a vendor pays back what it owes on a vendor credit (returned goods, an overcharge, a bill
 * overpaid) by check / ACH / wire / card / cash into one of the company's bank or cash accounts.
 *   · create — one accounting.vendor_refunds row, posted by the ONE posting engine (source type vendor_refund: Dr the bank account's
 *     ledger / Cr ap_control), and the vendor credit's unapplied amount is consumed (amount_applied_cents += refund) — on the caller's
 *     transaction, so a failure anywhere rolls the whole refund back.
 *   · void — never a delete: the posting is reversed through the engine and the amount goes back to the vendor credit.
 * No GL math here: the lines live in posting-engine.service.ts buildVendorRefundLines.
 */
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { companyBusinessDate } from "../lib/company-business-date.js";
import { nextVendorRefundDisplayId } from "./display-id.js";
import { postSourceTransactionInClientTx, reversePostedSourceTransactionInClientTx } from "./posting-engine.service.js";
import { REFUND_METHODS } from "./customer-refunds.service.js";

export const createVendorRefundBodySchema = z.object({
  vendor_credit_id: z.string().trim().uuid(),
  bank_account_id: z.string().trim().uuid(),
  amount_cents: z.coerce.number().int().positive(),
  refund_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  method: z.enum(REFUND_METHODS),
  reference: z.string().trim().max(80).optional().nullable(),
  memo: z.string().trim().max(2000).optional().nullable(),
  idempotency_key: z.string().trim().min(8).max(200).optional(),
});
export const voidVendorRefundBodySchema = z.object({ reason: z.string().trim().min(1).max(500) });

type Client = { query: (sql: string, values?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }> }; // eslint-disable-line @typescript-eslint/no-explicit-any
type Refusal = { code: 404 | 409 | 422; error: string; detail?: string };

const COLUMNS = `r.id::text, r.display_id, r.vendor_id, r.vendor_credit_id::text, vc.display_id AS vendor_credit_display_id,
  r.refund_date::text, r.amount_cents::bigint AS amount_cents, r.method, r.reference, r.bank_account_id::text,
  COALESCE(ba.display_name, ba.account_name) AS bank_account_name, r.bank_ledger_account_id::text, r.memo, r.journal_entry_id::text,
  r.created_at::text, r.voided_at::text, r.void_reason`;
const FROM = `accounting.vendor_refunds r
  JOIN accounting.vendor_credits vc ON vc.id = r.vendor_credit_id
  LEFT JOIN banking.bank_accounts ba ON ba.id = r.bank_account_id`;
const normalize = (row: Record<string, unknown>) => ({ ...row, amount_cents: Number(row.amount_cents) });

/** Live (not voided) refunds of one vendor credit, in cents — a vendor credit with any cannot be voided until its refunds are. */
export async function liveRefundCentsForVendorCredit(client: Client, operatingCompanyId: string, vendorCreditId: string): Promise<number> {
  const res = await client.query(
    `SELECT COALESCE(SUM(amount_cents), 0)::bigint AS cents FROM accounting.vendor_refunds
      WHERE operating_company_id = $1::uuid AND vendor_credit_id = $2::uuid AND voided_at IS NULL`,
    [operatingCompanyId, vendorCreditId]
  );
  return Number(res.rows[0]?.cents ?? 0);
}

export async function createVendorRefundInClientTx(
  client: Client,
  { operatingCompanyId, userId, input }: { operatingCompanyId: string; userId: string; input: z.infer<typeof createVendorRefundBodySchema> }
): Promise<Refusal | { code: 200 | 201; data: Record<string, unknown> }> {
  if (input.idempotency_key) {
    const prior = await client.query(
      `SELECT ${COLUMNS} FROM ${FROM} WHERE r.operating_company_id = $1::uuid AND r.idempotency_key = $2 LIMIT 1`,
      [operatingCompanyId, input.idempotency_key]
    );
    if (prior.rows[0]) return { code: 200, data: { refund: normalize(prior.rows[0]), replayed: true } };
  }

  const creditRes = await client.query(
    `SELECT id::text, vendor_id, display_id, status, voided_at::text, amount_cents::bigint AS amount_cents,
            amount_applied_cents::bigint AS amount_applied_cents
       FROM accounting.vendor_credits
      WHERE id = $1::uuid AND operating_company_id = $2::uuid
      LIMIT 1
      FOR UPDATE`,
    [input.vendor_credit_id, operatingCompanyId]
  );
  const credit = creditRes.rows[0];
  if (!credit) return { code: 404, error: "vendor_credit_not_found" };
  if (credit.voided_at || credit.status === "voided") return { code: 409, error: "vendor_credit_voided" };
  const unapplied = Number(credit.amount_cents) - Number(credit.amount_applied_cents);
  if (input.amount_cents > unapplied) {
    return { code: 422, error: "refund_exceeds_credit", detail: `Vendor credit ${credit.display_id} has ${unapplied} cents left; refund asks ${input.amount_cents}` };
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
  const displayId = await nextVendorRefundDisplayId(client as never, operatingCompanyId, new Date(`${refundDate}T12:00:00Z`));
  const ins = await client.query(
    `INSERT INTO accounting.vendor_refunds
       (operating_company_id, display_id, vendor_id, vendor_credit_id, refund_date, amount_cents, method, reference,
        bank_account_id, bank_ledger_account_id, memo, idempotency_key, created_by_user_id)
     VALUES ($1::uuid, $2, $3, $4::uuid, $5::date, $6, $7, $8, $9::uuid, $10::uuid, $11, $12, $13::uuid)
     RETURNING id::text`,
    [operatingCompanyId, displayId, credit.vendor_id ?? null, credit.id, refundDate, input.amount_cents, input.method, input.reference?.trim() || null,
      bank.id, bank.ledger_account_id, input.memo?.trim() || null, input.idempotency_key ?? null, userId]
  );
  const refundId = String(ins.rows[0]?.id ?? "");

  // THE posting (same transaction): Dr the bank the money came into / Cr A/P (the vendor's credit cleared).
  const posting = await postSourceTransactionInClientTx(
    client as never,
    { operating_company_id: operatingCompanyId, source_transaction_type: "vendor_refund", source_transaction_id: refundId },
    { userId }
  );
  const jeId = (posting as { journal_entry_id?: string | null })?.journal_entry_id ?? null;
  if (!jeId) throw new Error("vendor_refund_not_posted: the posting engine returned no journal entry");
  await client.query(`UPDATE accounting.vendor_refunds SET journal_entry_id = $2::uuid WHERE id = $1::uuid`, [refundId, jeId]);

  // The credit is used up by the refund — it can never be applied to a bill AND refunded (vendor_credits_check caps it).
  await client.query(
    `UPDATE accounting.vendor_credits
        SET amount_applied_cents = amount_applied_cents + $2,
            status = CASE WHEN amount_applied_cents + $2 >= amount_cents THEN 'applied' ELSE status END
      WHERE id = $1::uuid`,
    [credit.id, input.amount_cents]
  );

  await appendCrudAudit(
    client as never,
    userId,
    "accounting.vendor_refund.created",
    { resource_type: "accounting.vendor_refunds", resource_id: refundId, vendor_credit_id: credit.id, amount_cents: input.amount_cents,
      method: input.method, bank_account_id: bank.id, journal_entry_id: jeId },
    "info",
    "VENDOR-REFUNDS"
  );
  const out = await client.query(`SELECT ${COLUMNS} FROM ${FROM} WHERE r.id = $1::uuid`, [refundId]);
  return { code: 201, data: { refund: normalize(out.rows[0]) } };
}

export async function voidVendorRefundInClientTx(
  client: Client,
  { operatingCompanyId, userId, refundId, reason }: { operatingCompanyId: string; userId: string; refundId: string; reason: string }
): Promise<Refusal | { code: 200; data: Record<string, unknown> }> {
  const res = await client.query(
    `SELECT id::text, vendor_credit_id::text, amount_cents::bigint AS amount_cents, voided_at::text
       FROM accounting.vendor_refunds WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1 FOR UPDATE`,
    [refundId, operatingCompanyId]
  );
  const refund = res.rows[0];
  if (!refund) return { code: 404, error: "refund_not_found" };
  if (refund.voided_at) return { code: 409, error: "already_voided" };

  const rev = await reversePostedSourceTransactionInClientTx(
    client as never,
    { operating_company_id: operatingCompanyId, source_transaction_type: "vendor_refund", source_transaction_id: refundId },
    { userId },
    companyBusinessDate()
  );
  const reversalJeId = (rev as { journal_entry_id?: string | null })?.journal_entry_id ?? null;
  await client.query(
    `UPDATE accounting.vendor_refunds SET voided_at = now(), voided_by_user_id = $2::uuid, void_reason = $3 WHERE id = $1::uuid`,
    [refundId, userId, reason]
  );
  // The credit comes back to the vendor credit (open to apply or refund again).
  await client.query(
    `UPDATE accounting.vendor_credits
        SET amount_applied_cents = amount_applied_cents - $2,
            status = CASE WHEN status = 'applied' AND amount_applied_cents - $2 < amount_cents THEN 'open' ELSE status END
      WHERE id = $1::uuid AND status <> 'voided'`,
    [refund.vendor_credit_id, Number(refund.amount_cents)]
  );
  await appendCrudAudit(
    client as never,
    userId,
    "accounting.vendor_refund.voided",
    { resource_type: "accounting.vendor_refunds", resource_id: refundId, reason, reversal_journal_entry_id: reversalJeId },
    "warning",
    "VENDOR-REFUNDS"
  );
  const out = await client.query(`SELECT ${COLUMNS} FROM ${FROM} WHERE r.id = $1::uuid`, [refundId]);
  return { code: 200, data: { refund: normalize(out.rows[0]), reversal_journal_entry_id: reversalJeId } };
}

export async function listVendorRefunds(client: Client, operatingCompanyId: string, filter: { vendorId?: string; vendorCreditId?: string }) {
  const conds = ["r.operating_company_id = $1::uuid"];
  const params: unknown[] = [operatingCompanyId];
  if (filter.vendorId) { params.push(filter.vendorId); conds.push(`r.vendor_id = $${params.length}`); }
  if (filter.vendorCreditId) { params.push(filter.vendorCreditId); conds.push(`r.vendor_credit_id = $${params.length}::uuid`); }
  const res = await client.query(
    `SELECT ${COLUMNS} FROM ${FROM} WHERE ${conds.join(" AND ")} ORDER BY r.refund_date DESC, r.created_at DESC LIMIT 500`,
    params
  );
  return res.rows.map(normalize);
}
