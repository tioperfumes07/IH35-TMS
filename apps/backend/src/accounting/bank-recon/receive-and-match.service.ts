/**
 * ROUND 433 B8 (owner) — "when several transactions match one deposit, the user must be able to select SEVERAL
 * invoices." One bank DEPOSIT line, applied to N open invoices of one or several customers, as ONE transaction:
 *
 *   1. one customer payment (receive payment) per customer, written by the ONE payment writer
 *      (payments/customer-payment-create.service.ts — the same checks, poster, audit, outbox and spine event as the
 *      Receive Payment form), deposited to the bank line's own account, payment_source_kind 'bank_feed_match',
 *      source_bank_transaction_id = the line (payment -> line);
 *   2. its payment_applications against each selected invoice (payment <-> invoice), open balance net of credit memos;
 *   3. the multi-document accept (acceptMultiDocumentMatchInClient): one reconciliation match per payment, the line's
 *      matched pointer, the reverse stamp and every payment follow-up (line -> payments).
 *
 * The money must close. The applied amounts may not exceed the deposit. A remainder (deposit > applied) never vanishes:
 * the user names its home — either a customer credit (unapplied cash on that customer's payment, QuickBooks' "credit
 * on account") or a named difference account posted by the 1:1 path's own difference poster. No new GL math anywhere:
 * the receipt posts through postSourceTransactionInClientTx('customer_payment'), the difference through
 * postDifferenceJournalEntry. Anything that refuses rolls the whole transaction back — no payment without its match.
 */
import { withLuciaBypass } from "../../auth/db.js";
import { createCustomerPaymentInClient, type CustomerPaymentMethod } from "../payments/customer-payment-create.service.js";
import { acceptMultiDocumentMatchInClient } from "./match.service.js";

export class ReceiveAndMatchError extends Error {
  constructor(public code: string, public status: number, message?: string) {
    super(message ?? code);
  }
}

export type ReceiveAndMatchInput = {
  operating_company_id: string;
  bank_transaction_id: string;
  actor_user_uuid: string;
  applications: Array<{ invoice_id: string; amount_cents: number }>;
  payment_method?: CustomerPaymentMethod;
  reference_number?: string | null;
  /** Where a deposit larger than the applied total goes. Required when there is a remainder; refused when there is none. */
  remainder?: { kind: "customer_credit"; customer_id: string } | { kind: "difference"; account_id: string } | null;
};

export type ReceiveAndMatchResult = {
  bank_amount_cents: number;
  applied_cents: number;
  remainder_cents: number;
  payments: Array<{ id: string; display_id: string; customer_id: string; amount_cents: number; applications: number }>;
  match_ids: string[];
  difference_journal_entry_id: string | null;
};

/** Pure: group the selection by customer and settle the remainder. Exported for the unit test. */
export function planReceipts(
  bankAmountCents: number,
  invoiceCustomer: Map<string, string>,
  applications: ReceiveAndMatchInput["applications"],
  remainder: ReceiveAndMatchInput["remainder"]
): { byCustomer: Map<string, { amount_cents: number; applications: Array<{ invoice_id: string; amount_cents: number }> }>; applied: number; remainderCents: number } {
  if (!applications.length) throw new ReceiveAndMatchError("select_at_least_one_invoice", 400);
  const seen = new Set<string>();
  const byCustomer = new Map<string, { amount_cents: number; applications: Array<{ invoice_id: string; amount_cents: number }> }>();
  let applied = 0;
  for (const a of applications) {
    if (seen.has(a.invoice_id)) throw new ReceiveAndMatchError("duplicate_invoice_in_applications", 400);
    seen.add(a.invoice_id);
    if (!Number.isInteger(a.amount_cents) || a.amount_cents <= 0) throw new ReceiveAndMatchError("apply_amount_must_be_positive", 400);
    const customerId = invoiceCustomer.get(a.invoice_id);
    if (!customerId) throw new ReceiveAndMatchError("invoice_not_found", 404);
    const g = byCustomer.get(customerId) ?? { amount_cents: 0, applications: [] };
    g.amount_cents += a.amount_cents;
    g.applications.push({ invoice_id: a.invoice_id, amount_cents: a.amount_cents });
    byCustomer.set(customerId, g);
    applied += a.amount_cents;
  }
  if (applied > bankAmountCents) {
    throw new ReceiveAndMatchError("applications_exceed_bank_amount", 400, `Selected ${applied} cents exceeds the deposit's ${bankAmountCents} cents.`);
  }
  const remainderCents = bankAmountCents - applied;
  if (remainderCents === 0 && remainder) throw new ReceiveAndMatchError("no_remainder_to_place", 400);
  if (remainderCents > 0) {
    if (!remainder) {
      throw new ReceiveAndMatchError("remainder_needs_a_home", 400, `The deposit is ${remainderCents} cents more than the selected invoices; name a customer credit or a difference account.`);
    }
    if (remainder.kind === "customer_credit") {
      const g = byCustomer.get(remainder.customer_id) ?? { amount_cents: 0, applications: [] };
      g.amount_cents += remainderCents; // unapplied cash on that customer's payment = credit on account
      byCustomer.set(remainder.customer_id, g);
    }
  }
  return { byCustomer, applied, remainderCents };
}

export async function receivePaymentsAndMatch(input: ReceiveAndMatchInput): Promise<ReceiveAndMatchResult> {
  return withLuciaBypass(async (client) => {
    const companyId = input.operating_company_id;
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [companyId]);

    const lineRes = await client.query<{ bank_account_id: string; transaction_date: string; amount_cents: string; is_credit: boolean; review_state: string | null }>(
      `SELECT bank_account_id::text, transaction_date::text, amount_cents::text, is_credit, review_state
         FROM banking.bank_transactions
        WHERE id = $1::uuid AND operating_company_id = $2::uuid AND voided_at IS NULL
        FOR UPDATE`,
      [input.bank_transaction_id, companyId]
    );
    const line = lineRes.rows[0];
    if (!line) throw new ReceiveAndMatchError("bank_transaction_not_found", 404);
    if (!line.is_credit) throw new ReceiveAndMatchError("receive_payment_needs_a_deposit", 400, "Only a deposit (money in) can receive customer payments.");
    if (line.review_state === "matched") throw new ReceiveAndMatchError("bank_transaction_already_matched", 409);
    const bankAmountCents = Math.abs(Number(line.amount_cents));

    const invoiceIds = input.applications.map((a) => a.invoice_id);
    const invRes = await client.query<{ id: string; customer_id: string }>(
      `SELECT id::text, customer_id::text FROM accounting.invoices
        WHERE id = ANY($1::uuid[]) AND operating_company_id = $2::uuid AND voided_at IS NULL`,
      [invoiceIds, companyId]
    );
    const invoiceCustomer = new Map(invRes.rows.map((r) => [r.id, r.customer_id]));
    const plan = planReceipts(bankAmountCents, invoiceCustomer, input.applications, input.remainder ?? null);

    const date = line.transaction_date.slice(0, 10);
    const payments: ReceiveAndMatchResult["payments"] = [];
    for (const [customerId, g] of plan.byCustomer) {
      const created = await createCustomerPaymentInClient(client, input.actor_user_uuid, {
        operating_company_id: companyId,
        customer_id: customerId,
        received_at: date,
        amount_cents: g.amount_cents,
        payment_method: input.payment_method ?? "ach",
        bank_account_id: line.bank_account_id,
        reference_number: input.reference_number ?? null,
        applications: g.applications,
        payment_source_kind: "bank_feed_match",
        source_bank_transaction_id: input.bank_transaction_id,
        route: "POST /api/v1/bank-recon/receive-and-match",
      });
      if (created.code !== 201) throw new ReceiveAndMatchError(created.error, created.code);
      payments.push({ id: created.data.id, display_id: created.data.display_id, customer_id: customerId, amount_cents: g.amount_cents, applications: created.data.applications_count });
    }

    const matched = await acceptMultiDocumentMatchInClient(client, {
      operating_company_id: companyId,
      bank_transaction_id: input.bank_transaction_id,
      actor_user_uuid: input.actor_user_uuid,
      entries: payments.map((p) => ({ ledger_entry_kind: "payment" as const, ledger_entry_id: p.id })),
      difference_account_id: input.remainder?.kind === "difference" ? input.remainder.account_id : null,
    });

    return {
      bank_amount_cents: bankAmountCents,
      applied_cents: plan.applied,
      remainder_cents: plan.remainderCents,
      payments,
      match_ids: matched.match_ids,
      difference_journal_entry_id: matched.difference_journal_entry_id,
    };
  });
}
