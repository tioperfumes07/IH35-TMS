import { nextCreditMemoDisplayId } from "../display-id.js";
import { postSourceTransactionInClientTx } from "../posting-engine.service.js";
import { isEnabled } from "../../lib/feature-flags/service.js";
import { recordPostingFlagSkip, POSTING_FLAG_SKIP_RESULT } from "../posting-flag-skip-audit.js";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { backlinkBankTransactionToInvoice } from "./bank-invoice-backlink.service.js";

// CHAIN-06 — per-entity GL-posting kill switch for the customer-payment (A/R receipt) JE. The payment and
// its applications (AR reduced at the payment_applications level) are always written; posting the balanced
// receipt JE to the GL is gated PER-ENTITY via lib.feature_flags (isEnabled). Default OFF => the payment
// applies but no GL journal is posted (no-op), matching every other gated poster. Whether to turn this ON
// (or leave A/R-receipt posting always-on) is an OWNER decision (CHAIN-06); OFF-by-default is the safe state.
const CUSTOMER_PAYMENT_GL_POSTING_FLAG_KEY = "CUSTOMER_PAYMENT_GL_POSTING_ENABLED";

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

/**
 * ACCT-F5633 — accounting.invoices.amount_open_cents is a GENERATED column (total_cents -
 * amount_paid_cents, migration 0123) with NO knowledge of accounting.credit_memo_applications.
 * credit-memos.routes.ts's own apply route already nets this off before capping a credit-memo
 * application (its own comment: "a naive check against it alone would let a credit memo overshoot an
 * invoice that a PRIOR credit-memo application had already partially covered"), and ar-aging.service.ts
 * was retrofitted the same way under ACCT-F5612 — but neither of the two CASH-payment-apply cap checks
 * (this file's own applyToInvoice below, and customer-payments.routes.ts's inline duplicate) ever got
 * the same netting. Without it: a $1,000 invoice partly settled by a $600 credit memo still reports
 * amount_open_cents=$1,000 (the generated column never saw the credit memo), so a cash payment could
 * still apply up to the full $1,000 on top — a real $600 overcollection of A/R that the system's own
 * guard should have refused. Exported so every cash-payment-apply cap check can share one definition
 * rather than re-deriving the same subquery a third and fourth time.
 */
export async function getAppliedCreditMemoCents(
  client: Queryable,
  operatingCompanyId: string,
  invoiceId: string
): Promise<number> {
  const res = await client.query<{ applied_cents: string }>(
    `SELECT COALESCE(SUM(applied_cents), 0)::text AS applied_cents
       FROM accounting.credit_memo_applications
      WHERE invoice_id = $1
        AND operating_company_id = $2::uuid
        AND voided_at IS NULL`,
    [invoiceId, operatingCompanyId]
  );
  return Number(res.rows[0]?.applied_cents ?? 0);
}

export type PaymentApplicationTargetKind = "invoice" | "bill";

export type PaymentApplicationInput = {
  target_kind: PaymentApplicationTargetKind;
  target_id: string;
  amount_cents: number;
};

export type ApplyPaymentInput = {
  operating_company_id: string;
  payment_id: string;
  applications: PaymentApplicationInput[];
};

export type ApplyPaymentActor = {
  user_id: string;
};

export class ApplyPaymentError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

type LockedPayment = {
  id: string;
  customer_id: string;
  payment_date: string;
  amount_unapplied_cents: number;
  voided_at: string | null;
};

function normalizeApplications(applications: PaymentApplicationInput[]) {
  const out: PaymentApplicationInput[] = [];
  for (const row of applications) {
    const amount = Number(row.amount_cents ?? 0);
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
      throw new ApplyPaymentError("invalid_amount", "application amount must be a positive integer in cents");
    }
    if (row.target_kind !== "invoice" && row.target_kind !== "bill") {
      throw new ApplyPaymentError("invalid_target_kind", `unsupported target kind: ${row.target_kind}`);
    }
    out.push({
      target_kind: row.target_kind,
      target_id: row.target_id,
      amount_cents: amount,
    });
  }
  if (out.length === 0) {
    throw new ApplyPaymentError("no_applications", "at least one application is required");
  }
  return out;
}

function assertNoDuplicateTargets(applications: PaymentApplicationInput[]) {
  const seen = new Set<string>();
  for (const row of applications) {
    const key = `${row.target_kind}:${row.target_id}`;
    if (seen.has(key)) {
      throw new ApplyPaymentError("duplicate_target", "duplicate application target in request");
    }
    seen.add(key);
  }
}

async function lockPayment(client: Queryable, operatingCompanyId: string, paymentId: string): Promise<LockedPayment> {
  const paymentRes = await client.query<LockedPayment>(
    `
      SELECT
        p.id::text,
        p.customer_id::text,
        p.payment_date::text,
        p.amount_unapplied_cents::bigint AS amount_unapplied_cents,
        p.voided_at::text
      FROM accounting.payments p
      WHERE p.id = $1::uuid
        AND p.operating_company_id = $2::uuid
      LIMIT 1
      FOR UPDATE
    `,
    [paymentId, operatingCompanyId]
  );
  const payment = paymentRes.rows[0];
  if (!payment) throw new ApplyPaymentError("payment_not_found", "payment not found");
  if (payment.voided_at) throw new ApplyPaymentError("payment_voided", "voided payment cannot be applied");
  return payment;
}

async function applyToInvoice(
  client: Queryable,
  operatingCompanyId: string,
  payment: LockedPayment,
  row: PaymentApplicationInput,
  userId: string
) {
  const invoiceRes = await client.query<{
    id: string;
    customer_id: string;
    status: string;
    amount_open_cents: number;
  }>(
    `
      SELECT
        i.id::text,
        i.customer_id::text,
        i.status::text,
        i.amount_open_cents::bigint AS amount_open_cents
      FROM accounting.invoices i
      WHERE i.id = $1::uuid
        AND i.operating_company_id = $2::uuid
      LIMIT 1
      FOR UPDATE
    `,
    [row.target_id, operatingCompanyId]
  );
  const invoice = invoiceRes.rows[0];
  if (!invoice) throw new ApplyPaymentError("invoice_not_found", "invoice target not found");
  if (String(invoice.customer_id) !== String(payment.customer_id)) {
    throw new ApplyPaymentError("invoice_customer_mismatch", "invoice customer does not match payment customer");
  }
  if (!["sent", "partial"].includes(String(invoice.status))) {
    throw new ApplyPaymentError("invoice_not_open_for_payment", "invoice is not open for payment application");
  }
  const appliedCreditMemoCents = await getAppliedCreditMemoCents(client, operatingCompanyId, invoice.id);
  const invoiceRemainingCents = Number(invoice.amount_open_cents ?? 0) - appliedCreditMemoCents;
  if (row.amount_cents > invoiceRemainingCents) {
    throw new ApplyPaymentError("amount_exceeds_invoice_open", "application amount exceeds invoice open amount");
  }

  const inserted = await client.query<{ id: string }>(
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
      ) VALUES ($1::uuid, $2::uuid, $3::uuid, 'invoice', $3::uuid, $4, $5::numeric(18,2), $6::uuid, $6::uuid)
      ON CONFLICT (payment_id, target_kind, target_id)
      DO UPDATE SET
        amount_cents = accounting.payment_applications.amount_cents + EXCLUDED.amount_cents,
        amount_applied = accounting.payment_applications.amount_applied + EXCLUDED.amount_applied
      RETURNING id::text
    `,
    [operatingCompanyId, payment.id, row.target_id, row.amount_cents, row.amount_cents / 100, userId]
  );
  return inserted.rows[0]?.id ?? null;
}

async function applyToBill(
  client: Queryable,
  operatingCompanyId: string,
  payment: LockedPayment,
  row: PaymentApplicationInput,
  userId: string
) {
  const billRes = await client.query<{
    id: string;
    customer_id: string | null;
    amount_cents: number | null;
    paid_cents: number | null;
    status: string;
  }>(
    `
      SELECT
        b.id::text,
        b.customer_id::text,
        b.amount_cents::bigint AS amount_cents,
        b.paid_cents::bigint AS paid_cents,
        b.status::text
      FROM accounting.bills b
      WHERE b.id = $1::uuid
        AND b.operating_company_id = $2::uuid
      LIMIT 1
      FOR UPDATE
    `,
    [row.target_id, operatingCompanyId]
  );
  const bill = billRes.rows[0];
  if (!bill) throw new ApplyPaymentError("bill_not_found", "bill target not found");
  if (bill.customer_id && String(bill.customer_id) !== String(payment.customer_id)) {
    throw new ApplyPaymentError("bill_customer_mismatch", "bill customer does not match payment customer");
  }
  const billTotal = Number(bill.amount_cents ?? 0);
  const billPaid = Number(bill.paid_cents ?? 0);
  const billOpen = Math.max(0, billTotal - billPaid);
  if (row.amount_cents > billOpen) {
    throw new ApplyPaymentError("amount_exceeds_bill_open", "application amount exceeds bill open amount");
  }

  const inserted = await client.query<{ id: string }>(
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
      ) VALUES ($1::uuid, $2::uuid, NULL, 'bill', $3::uuid, $4, $5::numeric(18,2), $6::uuid, $6::uuid)
      ON CONFLICT (payment_id, target_kind, target_id)
      DO UPDATE SET
        amount_cents = accounting.payment_applications.amount_cents + EXCLUDED.amount_cents,
        amount_applied = accounting.payment_applications.amount_applied + EXCLUDED.amount_applied
      RETURNING id::text
    `,
    [operatingCompanyId, payment.id, row.target_id, row.amount_cents, row.amount_cents / 100, userId]
  );
  return inserted.rows[0]?.id ?? null;
}

async function createArCreditMemo(
  client: Queryable,
  operatingCompanyId: string,
  payment: LockedPayment,
  remainderCents: number,
  userId: string
) {
  const displayId = await nextCreditMemoDisplayId(client, operatingCompanyId, new Date(`${payment.payment_date}T00:00:00.000Z`));
  await client.query(
    `
      INSERT INTO accounting.credit_memos (
        operating_company_id,
        customer_id,
        display_id,
        status,
        reason,
        issue_date,
        amount_cents,
        notes,
        created_by_user_id
      ) VALUES ($1::uuid, $2::uuid, $3, 'issued', 'other', $4::date, $5, $6, $7::uuid)
    `,
    [
      operatingCompanyId,
      payment.customer_id,
      displayId,
      payment.payment_date,
      remainderCents,
      `Auto-created from unapplied overpayment on ${payment.id}`,
      userId,
    ]
  );
  return displayId;
}

export async function applyPayment(client: Queryable, input: ApplyPaymentInput, actor: ApplyPaymentActor) {
  await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);

  const applications = normalizeApplications(input.applications);
  assertNoDuplicateTargets(applications);

  const payment = await lockPayment(client, input.operating_company_id, input.payment_id);
  const idempotentApplicationIds: string[] = [];
  const effectiveApplications: PaymentApplicationInput[] = [];

  for (const row of applications) {
    const existingRes = await client.query<{ id: string; amount_cents: number }>(
      `
        SELECT id::text, amount_cents::bigint AS amount_cents
        FROM accounting.payment_applications
        WHERE payment_id = $1::uuid
          AND target_kind = $2
          AND target_id = $3::uuid
        LIMIT 1
      `,
      [input.payment_id, row.target_kind, row.target_id]
    );
    const existing = existingRes.rows[0] ?? null;
    const existingAmount = Number(existing?.amount_cents ?? 0);
    if (existing && existingAmount >= row.amount_cents) {
      idempotentApplicationIds.push(existing.id);
      continue;
    }
    effectiveApplications.push({
      ...row,
      amount_cents: row.amount_cents - existingAmount,
    });
  }

  const requestedTotal = effectiveApplications.reduce((sum, row) => sum + row.amount_cents, 0);
  if (requestedTotal > Number(payment.amount_unapplied_cents ?? 0)) {
    throw new ApplyPaymentError("amount_exceeds_payment_unapplied", "application amount exceeds payment unapplied amount");
  }

  const applicationIds: string[] = [...idempotentApplicationIds];
  for (const row of effectiveApplications) {
    const applicationId =
      row.target_kind === "invoice"
        ? await applyToInvoice(client, input.operating_company_id, payment, row, actor.user_id)
        : await applyToBill(client, input.operating_company_id, payment, row, actor.user_id);
    if (applicationId) applicationIds.push(applicationId);
  }

  // Kill switch: resolve the per-entity flag on the same scoped client (operating_company_id already set
  // above). Flag OFF (default) => skip the GL post entirely; the payment + applications above still stand.
  const customerPaymentPostingEnabled = await isEnabled(client, CUSTOMER_PAYMENT_GL_POSTING_FLAG_KEY, {
    operating_company_id: input.operating_company_id,
    user_uuid: actor.user_id,
  });
  if (customerPaymentPostingEnabled) {
    // ACCT-F165 — MUST be the in-client-tx poster, on the CALLER'S client.
    //
    // This called postSourceTransaction(), which opens its OWN pool connection and its OWN
    // transaction. Every write above — applyToInvoice/applyToBill inserting
    // accounting.payment_applications — happens on `client`, inside the caller's still-open
    // transaction. From a second connection those rows are UNCOMMITTED and therefore INVISIBLE, so
    // the poster looked at a payment with no visible applications, had nothing to post, and returned
    // without writing a journal entry. No error, no skip audit — the receipt just stayed dark.
    //
    // The two sibling ROUTES (payments.routes.ts, customer-payments.routes.ts) already carry this
    // exact fix and this exact explanation in their comments. This shared service was missed, and it
    // is the path the office UI's payment-application action actually runs through — which is why
    // the routes read as fixed while USMCA payments kept posting nothing.
    //
    // Passing `client` also makes the applications and their journal entry commit or roll back as ONE
    // unit: there is no window where A/R has moved in the subledger and the GL has not.
    await postSourceTransactionInClientTx(
      client,
      {
        operating_company_id: input.operating_company_id,
        source_transaction_type: "customer_payment",
        source_transaction_id: input.payment_id,
        posting_purpose: "initial_post",
      },
      { userId: actor.user_id }
    );
  } else {
    // Flag OFF: the payment + applications above still stand, but the GL receipt JE is skipped.
    // Record the skip append-only so this is never a silent success (verify-no-silent-noop-posting).
    await recordPostingFlagSkip(client, actor.user_id, {
      flagKey: CUSTOMER_PAYMENT_GL_POSTING_FLAG_KEY,
      postingDomain: "customer_payment",
      operatingCompanyId: input.operating_company_id,
      context: { payment_id: input.payment_id },
    });
  }

  const refreshedPaymentRes = await client.query<{ amount_unapplied_cents: number }>(
    `SELECT amount_unapplied_cents::bigint AS amount_unapplied_cents FROM accounting.payments WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
    [input.payment_id, input.operating_company_id]
  );
  const unappliedAfter = Number(refreshedPaymentRes.rows[0]?.amount_unapplied_cents ?? 0);

  let overpaymentCreditMemoDisplayId: string | null = null;
  if (unappliedAfter > 0 && effectiveApplications.length > 0 && applications.every((row) => row.target_kind === "invoice")) {
    overpaymentCreditMemoDisplayId = await createArCreditMemo(
      client,
      input.operating_company_id,
      payment,
      unappliedAfter,
      actor.user_id
    );
  }

  // HOP 9 — stamp the bank line that carried this cash with the invoice it settled. Linkage only:
  // it never throws into the payment path, because a failed back-link must not undo money that has
  // already moved. banking.bank_transactions.matched_invoice_id had ZERO writers before this.
  const bankBacklink = await backlinkBankTransactionToInvoice(
    client,
    input.operating_company_id,
    input.payment_id,
    applications.filter((a) => a.target_kind === "invoice").map((a) => a.target_id)
  );
  if (bankBacklink.linked) {
    await appendCrudAudit(
      client,
      actor.user_id,
      "banking.bank_transaction.matched_to_invoice",
      {
        operating_company_id: input.operating_company_id,
        bank_transaction_id: bankBacklink.bank_transaction_id,
        invoice_id: bankBacklink.invoice_id,
        payment_id: input.payment_id,
      },
      "info",
      "HOP9-BANK-PATH"
    );
  }

  return {
    payment_id: payment.id,
    application_ids: applicationIds,
    bank_backlink: bankBacklink,
    amount_unapplied_cents: unappliedAfter,
    overpayment_credit_memo_display_id: overpaymentCreditMemoDisplayId,
    // Honest posting signal: "posted" when the GL receipt JE was written, the discriminated
    // skip value when the CUSTOMER_PAYMENT_GL_POSTING flag was OFF. Never a silent success.
    gl_posting: customerPaymentPostingEnabled ? ("posted" as const) : POSTING_FLAG_SKIP_RESULT,
  };
}
