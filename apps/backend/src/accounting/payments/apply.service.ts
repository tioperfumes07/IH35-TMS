import { nextCreditMemoDisplayId } from "../display-id.js";
import { postSourceTransaction } from "../posting-engine.service.js";

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

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
  if (row.amount_cents > Number(invoice.amount_open_cents ?? 0)) {
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

  await postSourceTransaction(
    {
      operating_company_id: input.operating_company_id,
      source_transaction_type: "customer_payment",
      source_transaction_id: input.payment_id,
      posting_purpose: "initial_post",
    },
    { userId: actor.user_id }
  );

  const refreshedPaymentRes = await client.query<{ amount_unapplied_cents: number }>(
    `SELECT amount_unapplied_cents::bigint AS amount_unapplied_cents FROM accounting.payments WHERE id = $1::uuid LIMIT 1`,
    [input.payment_id]
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

  return {
    payment_id: payment.id,
    application_ids: applicationIds,
    amount_unapplied_cents: unappliedAfter,
    overpayment_credit_memo_display_id: overpaymentCreditMemoDisplayId,
  };
}
