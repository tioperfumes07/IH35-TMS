/**
 * THE ONE writer of a customer payment (receive payment) and its invoice applications, on the CALLER's transaction.
 *
 * Moved out of POST /api/v1/customers/:id/payments (customer-payments.routes.ts) unchanged, so a second caller — the
 * Banking "receive and match" (B8: one bank deposit applied to several invoices) — creates its payments through the
 * same checks, the same poster and the same audit / outbox / spine event, never a copy. Every rule that lived on the
 * route lives here: the deposit account bridge (bank_account -> ledger_account_id, never 1090), the open-balance check
 * net of credit-memo applications, the customer scope, the in-transaction post (postSourceTransactionInClientTx) or
 * the append-only skip audit.
 */
import type { PoolClient } from "pg";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { resolvePaymentDisplayId } from "../display-id.js";
import { enqueueAccountingOutbox } from "../outbox-events.js";
import { emitAccountingSpineEvent } from "../accounting-spine-emit.js";
import { assertBankAccountUsable } from "../../banking/bank-account-visibility.js";
import { resolveRoleAccountOptional } from "../coa-roles/resolver.service.js";
import { postSourceTransactionInClientTx } from "../posting-engine.service.js";
import { isEnabled } from "../../lib/feature-flags/service.js";
import { recordPostingFlagSkip } from "../posting-flag-skip-audit.js";
import { getAppliedCreditMemoCents } from "./apply.service.js";

export type CustomerPaymentMethod = "ach" | "wire" | "check" | "cash" | "factoring_advance" | "factoring_reserve" | "credit_card" | "other";

export type CreateCustomerPaymentInput = {
  operating_company_id: string;
  customer_id: string;
  received_at: string;
  amount_cents: number;
  payment_method: CustomerPaymentMethod;
  bank_account_id?: string | null;
  reference_number?: string | null;
  is_sample_data?: boolean;
  display_id?: string | null;
  applications: Array<{ invoice_id: string; amount_cents: number }>;
  /** 'manual' for the Receive Payment form; 'bank_feed_match' when Banking creates it from a bank line. */
  payment_source_kind?: string;
  /** The bank line this receipt IS (reverse pointer), when it is created from Banking. */
  source_bank_transaction_id?: string | null;
  /** For the skip audit's context only. */
  route: string;
};

export type CreateCustomerPaymentResult =
  | { code: 201; data: { id: string; display_id: string; amount_unapplied_cents: number; applications_count: number } }
  | { code: 400 | 404 | 409 | 500; error: string };

export async function createCustomerPaymentInClient(
  client: PoolClient,
  actorUserUuid: string,
  input: CreateCustomerPaymentInput
): Promise<CreateCustomerPaymentResult> {
  const companyId = input.operating_company_id;
  const sumApplied = input.applications.reduce((sum, row) => sum + Number(row.amount_cents ?? 0), 0);
  if (sumApplied > input.amount_cents) return { code: 400, error: "payment_apply_exceeds_total" };
  const dup = new Set<string>();
  for (const row of input.applications) {
    if (dup.has(row.invoice_id)) return { code: 400, error: "duplicate_invoice_in_applications" };
    dup.add(row.invoice_id);
  }

  const customerRes = await client.query(
    `SELECT id FROM mdata.customers WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`,
    [input.customer_id, companyId]
  );
  if (!customerRes.rows[0]) return { code: 404, error: "customer_not_found" };

  // deposited_to_account_id stores catalogs.accounts.id (GL debit). bank_account_id is the
  // Banking row — bridge via ledger_account_id. Never store a free-text bank slug.
  let depositedToAccountId: string | null = null;
  if (input.bank_account_id) {
    const acctRes = await client.query(
      `
        SELECT id::text AS id, ledger_account_id::text AS ledger_account_id
        FROM banking.bank_accounts
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid
        LIMIT 1
      `,
      [input.bank_account_id, companyId]
    );
    const bankRow = acctRes.rows[0] as { id: string; ledger_account_id: string | null } | undefined;
    if (!bankRow) return { code: 400, error: "bank_account_not_found" };
    // BANK-ACCOUNT-HIDE: an account hidden for THIS entity can never receive a NEW payment
    // deposit (flag OFF by default — see docs/accounting/BANK-ACCOUNT-ENTITY-HIDE-DESIGN.md).
    if (!(await assertBankAccountUsable(client, input.bank_account_id, companyId))) {
      return { code: 400, error: "bank_account_not_found" };
    }
    depositedToAccountId = bankRow.ledger_account_id;
    if (!depositedToAccountId) return { code: 400, error: "bank_account_missing_ledger_gl" };
  } else {
    // ROUND 326 queue item 12 (G-06) + owner ruling 2026-10-02 ("no holding accounts — every payment on a real
    // account, default Bank of America, editable like QuickBooks"): a payment with no deposit account picked lands
    // on the operating bank, never in 1090 Undeposited Funds, where it waited for a sweep that often never came.
    depositedToAccountId = await resolveRoleAccountOptional(client, companyId, "operating_bank");
    if (!depositedToAccountId) return { code: 400, error: "operating_bank_unmapped" };
  }

  const displayId = await resolvePaymentDisplayId(
    client,
    companyId,
    new Date(`${input.received_at}T00:00:00.000Z`),
    input.display_id ?? undefined
  );

  const paymentRes = await client.query(
    `
      INSERT INTO accounting.payments (
        operating_company_id,
        customer_id,
        display_id,
        payment_method,
        payment_date,
        reference,
        amount_cents,
        deposited_to_account_id,
        notes,
        created_by_user_id,
        payment_source_kind,
        source_bank_transaction_id,
        -- FAIL-F2 sweep / ACCT-F264 — customer payments could not be marked TEST data either.
        -- accounting.payments.is_sample_data exists (12,129 rows) and NOTHING wrote it, exactly as
        -- expenses and bills did not until #4993. posting-engine resolves the flag from the SOURCE
        -- row (customer_payment is in SAMPLE_TAGGED_SOURCE_TABLES), so an untagged payment yields
        -- an untagged journal entry and sample cash lands in real books.
        is_sample_data
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING id, display_id, amount_unapplied_cents
    `,
    [
      companyId,
      input.customer_id,
      displayId,
      input.payment_method,
      input.received_at,
      input.reference_number ?? null,
      input.amount_cents,
      depositedToAccountId,
      null,
      actorUserUuid,
      input.payment_source_kind ?? "manual",
      input.source_bank_transaction_id ?? null,
      // $13 — only an explicit true marks sample; omitting it keeps the column's false default, so
      // no existing caller changes behaviour and nothing is retroactively re-classified.
      input.is_sample_data === true,
    ]
  );
  const payment = paymentRes.rows[0] as { id: string; display_id: string; amount_unapplied_cents: number } | undefined;
  if (!payment?.id) return { code: 500, error: "payment_create_failed" };

  let applicationsCount = 0;
  for (const applyRow of input.applications) {
    const invoiceRes = await client.query(
      `
        SELECT id, amount_open_cents, status
        FROM accounting.invoices
        WHERE id = $1
          AND operating_company_id = $2::uuid
          AND customer_id = $3
        LIMIT 1
      `,
      [applyRow.invoice_id, companyId, input.customer_id]
    );
    const invoice = invoiceRes.rows[0] as { id: string; amount_open_cents: number; status: string } | null;
    if (!invoice) return { code: 404, error: "invoice_not_found_for_customer" };
    if (!["sent", "partial"].includes(String(invoice.status))) return { code: 409, error: "invoice_not_open_for_payment" };
    // ACCT-F5633 — amount_open_cents (a GENERATED column) has no knowledge of non-voided
    // credit-memo applications; net them off the same way credit-memos.routes.ts's own apply
    // route and ar-aging.service.ts (ACCT-F5612) already do, or a cash payment could still apply
    // on top of a balance a credit memo already covered.
    const appliedCreditMemoCents = await getAppliedCreditMemoCents(client, companyId, invoice.id);
    const invoiceRemainingCents = Number(invoice.amount_open_cents ?? 0) - appliedCreditMemoCents;
    if (Number(applyRow.amount_cents) > invoiceRemainingCents) return { code: 400, error: "apply_amount_exceeds_invoice_open" };

    await client.query(
      `
        INSERT INTO accounting.payment_applications (
          operating_company_id,
          payment_id,
          invoice_id,
          target_kind,
          target_id,
          amount_cents,
          amount_applied,
          applied_by_user_id,
          applied_by_user_uuid
        ) VALUES ($1,$2,$3,'invoice',$3,$4,$5,$6,$6)
      `,
      [companyId, payment.id, applyRow.invoice_id, applyRow.amount_cents, applyRow.amount_cents / 100, actorUserUuid]
    );
    applicationsCount += 1;
  }

  // CLS-SUBLEDGER-GL-DARK / ACCT-F150 — POST THE RECEIPT, in the caller's transaction (postSourceTransactionInClientTx,
  // never postSourceTransaction: the payment row above is not committed yet, and the payment, its applications and its
  // journal entry must commit or roll back as ONE unit). ACCT-F5705: every real payment either posts or is skip-audited,
  // including a zero-application payment (customer credit) — the poster reads accounting.payments.amount_cents only.
  const customerPaymentPostingEnabled = await isEnabled(client, "CUSTOMER_PAYMENT_GL_POSTING_ENABLED", {
    operating_company_id: companyId,
    user_uuid: actorUserUuid,
  });
  if (customerPaymentPostingEnabled) {
    await postSourceTransactionInClientTx(
      client,
      {
        operating_company_id: companyId,
        source_transaction_type: "customer_payment",
        source_transaction_id: payment.id,
        posting_purpose: "initial_post",
      },
      { userId: actorUserUuid }
    );
  } else {
    await recordPostingFlagSkip(client, actorUserUuid, {
      flagKey: "CUSTOMER_PAYMENT_GL_POSTING_ENABLED",
      postingDomain: "customer_payment",
      operatingCompanyId: companyId,
      context: { payment_id: payment.id, route: input.route },
    });
  }

  const refreshedRes = await client.query(`SELECT amount_unapplied_cents FROM accounting.payments WHERE id = $1 LIMIT 1`, [payment.id]);
  const refreshed = refreshedRes.rows[0] ?? { amount_unapplied_cents: 0 };

  await enqueueAccountingOutbox(client, companyId, "qbo.customer_payment.created", "customer_payment", payment.id, {
    payment_id: payment.id,
    customer_id: input.customer_id,
    amount_cents: input.amount_cents,
    payment_date: input.received_at,
  });

  await appendCrudAudit(
    client,
    actorUserUuid,
    "accounting.customer_payment.created.p6_t11204",
    {
      resource_type: "accounting.payments",
      resource_id: payment.id,
      operating_company_id: companyId,
      customer_id: input.customer_id,
      display_id: payment.display_id,
      applications_count: applicationsCount,
      ...(input.source_bank_transaction_id ? { source_bank_transaction_id: input.source_bank_transaction_id } : {}),
    },
    "info",
    "P6-T11204-PAYMENTS"
  );

  // ACCOUNTING-SPINE-EVENT-FIRE-AND-FORGET-SILENT-DROP: emitted in the payment's own creation transaction, awaited, so
  // the write and its spine event can never diverge.
  await emitAccountingSpineEvent(client, {
    operating_company_id: companyId,
    actor_user_id: String(actorUserUuid),
    event_type: "payment.customer_created",
    entity_id: payment.id,
    entity_type: "customer_payment",
    source_table: "accounting.payments",
  });

  return {
    code: 201,
    data: {
      id: payment.id,
      display_id: payment.display_id,
      amount_unapplied_cents: Number(refreshed.amount_unapplied_cents ?? 0),
      applications_count: applicationsCount,
    },
  };
}
