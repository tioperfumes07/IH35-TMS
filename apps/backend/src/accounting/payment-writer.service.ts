/**
 * The ONE customer-payment engine (443.182 C step 2): the accounting.payments row writer, the payment_applications writer,
 * the customer-payment GL post (or its flag-OFF skip audit) and recordCustomerPaymentInClientTx. Heavy CI peel (Lead
 * 13:45Z): moved here, byte-for-byte, out of payments.routes.ts — an HTTP route module — because the apply service
 * (payments/apply.service.ts) needs the writer and imported the route module to get it (verify-steps 12399
 * no-service-imports-an-http-route-module). payments.routes.ts and customer-payments.routes.ts import it from here.
 */
import { appendCrudAudit } from "../audit/crud-audit.js";
import { isEnabled } from "../lib/feature-flags/service.js";
import { emitAccountingSpineEvent, type AccountingSpineEvent } from "./accounting-spine-emit.js";
import { nextPaymentDisplayId, resolvePaymentDisplayId } from "./display-id.js";
import { postSourceTransactionInClientTx } from "./posting-engine.service.js";
import { recordPostingFlagSkip } from "./posting-flag-skip-audit.js";

/**
 * LEAD 443.182 C — the ONE accounting.payments row writer (one writer per document; guard 18481). Both customer-payment
 * create paths (POST /api/v1/accounting/payments here, POST /customers/:id/payments in customer-payments.routes.ts) write
 * their row through this function, on their own client and transaction, with exactly the columns they always wrote:
 * payment_source_kind / source_bank_transaction_id are written only when the caller gives them (else the table default).
 * Callers keep their own validation, display-id, applications, attachments and GL posting.
 */
export type PaymentRowInsert = {
  operating_company_id: string;
  customer_id: string;
  display_id: string;
  payment_method: string;
  payment_date: string;
  reference: string | null;
  amount_cents: number;
  deposited_to_account_id: string;
  notes: string | null;
  created_by_user_id: string;
  /** ACCT-F353 / ACCT-F264 — only an explicit true marks sample; posting-engine reads it from this SOURCE row. */
  is_sample_data: boolean;
  payment_source_kind?: string;
  source_bank_transaction_id?: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function insertPaymentRowInClientTx(client: { query: (sql: string, values?: unknown[]) => Promise<any> }, row: PaymentRowInsert) {
  const cols: Array<keyof PaymentRowInsert> = [
    "operating_company_id", "customer_id", "display_id", "payment_method", "payment_date", "reference", "amount_cents",
    "deposited_to_account_id", "notes", "created_by_user_id",
  ];
  if ("payment_source_kind" in row) cols.push("payment_source_kind");
  if ("source_bank_transaction_id" in row) cols.push("source_bank_transaction_id");
  // is_sample_data is ALWAYS written (last), never left to a caller to remember (ACCT-F353 / ACCT-F264).
  const values: unknown[] = [...cols.map((c) => row[c] ?? null), row.is_sample_data === true];
  const res = await client.query(
    `INSERT INTO accounting.payments (${cols.join(", ")}, is_sample_data) VALUES (${values.map((_, i) => `$${i + 1}`).join(", ")})
     RETURNING id, display_id, amount_unapplied_cents`,
    values
  );
  return res.rows[0] as { id: string; display_id: string; amount_unapplied_cents: number } | undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PaymentEngineClient = { query: (sql: string, values?: unknown[]) => Promise<any> };

/** Lead 03:22Z — a refused invoice application aborts the payment's transaction (nothing is committed). */
export class PaymentApplicationRefusedError extends Error {
  constructor(readonly code: 400 | 404 | 409, readonly error: string) {
    super(error);
    this.name = "PaymentApplicationRefusedError";
  }
}

/**
 * 443.182 C step 2 — the ONE payment_applications writer (invoice or bill target). The ON CONFLICT merge is the shape the
 * apply service always wrote; on a brand-new payment (the two create routes) no row exists yet and duplicate targets are
 * refused before this is reached, so the merge never fires there and the inserted row is the same as before.
 */
export async function insertPaymentApplicationRowInClientTx(
  client: PaymentEngineClient,
  row: { operating_company_id: string; payment_id: string; target_kind: "invoice" | "bill"; target_id: string; amount_cents: number; user_id: string }
) {
  const res = await client.query(
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
      ) VALUES ($1::uuid, $2::uuid, ${row.target_kind === "invoice" ? "$3::uuid" : "NULL"}, $4, $3::uuid, $5, $6::numeric(18,2), $7::uuid, $7::uuid)
      ON CONFLICT (payment_id, target_kind, target_id)
      DO UPDATE SET
        amount_cents = accounting.payment_applications.amount_cents + EXCLUDED.amount_cents,
        amount_applied = accounting.payment_applications.amount_applied + EXCLUDED.amount_applied
      RETURNING id::text
    `,
    [row.operating_company_id, row.payment_id, row.target_id, row.target_kind, row.amount_cents, row.amount_cents / 100, row.user_id]
  );
  return (res.rows[0] as { id: string } | undefined)?.id ?? null;
}

/**
 * 443.182 C step 2 — the ONE customer-payment GL post (or its append-only skip audit when the per-entity flag is OFF), on
 * the caller's client so the payment, its applications and its JE commit or roll back together. Returns whether it posted.
 */
export async function postCustomerPaymentOrRecordSkipInClientTx(
  client: PaymentEngineClient,
  input: { operating_company_id: string; payment_id: string; user_id: string; skip_context: Record<string, unknown> }
) {
  const enabled = await isEnabled(client, "CUSTOMER_PAYMENT_GL_POSTING_ENABLED", {
    operating_company_id: input.operating_company_id,
    user_uuid: input.user_id,
  });
  if (enabled) {
    await postSourceTransactionInClientTx(
      client,
      {
        operating_company_id: input.operating_company_id,
        source_transaction_type: "customer_payment",
        source_transaction_id: input.payment_id,
        posting_purpose: "initial_post",
      },
      { userId: input.user_id }
    );
  } else {
    await recordPostingFlagSkip(client, input.user_id, {
      flagKey: "CUSTOMER_PAYMENT_GL_POSTING_ENABLED",
      postingDomain: "customer_payment",
      operatingCompanyId: input.operating_company_id,
      context: input.skip_context,
    });
  }
  return enabled;
}

/** A payment document as the create forms hand it to the engine. */
export type CustomerPaymentDocument = {
  row: Omit<PaymentRowInsert, "display_id">;
  /** Operator-typed number (QBO custom document number) — the engine resolves / numbers it. */
  requested_display_id?: string;
  /** Invoice applications, in the order the form sent them. */
  applications: Array<{ invoice_id: string; amount_cents: number }>;
  /** The form's own per-invoice check (run before each application row is written); returns an error code or null. */
  validate_application: (application: { invoice_id: string; amount_cents: number }) => Promise<{ code: 400 | 404 | 409; error: string } | null>;
  /** Form-specific step right after the payment row exists (e.g. draft attachments). */
  after_payment_insert?: (paymentId: string) => Promise<void>;
  /** Form-specific step right before the audit row (e.g. the QBO outbox). */
  before_audit?: (paymentId: string) => Promise<void>;
  /** Extra fields for the flag-OFF skip audit (the engine adds payment_id). */
  skip_context: Record<string, unknown>;
  audit: { action: string; module: string };
  spine: { event_type: AccountingSpineEvent; entity_type: string };
};

/**
 * 443.182 C step 2 — the ONE engine that records a customer payment: numbers it, writes the payment row, writes its
 * invoice applications, posts its JE (or the skip audit), audits it, emits its spine event — in that order, on the
 * caller's client. Both create forms (Receive Payment and the customer's Record Payment) pass their document here.
 */
export async function recordCustomerPaymentInClientTx(client: PaymentEngineClient, doc: CustomerPaymentDocument) {
  const oci = doc.row.operating_company_id;
  const displayId = await resolvePaymentDisplayId(
    client,
    oci,
    new Date(`${doc.row.payment_date}T00:00:00.000Z`),
    doc.requested_display_id
  );
  const payment = await insertPaymentRowInClientTx(client, { ...doc.row, display_id: displayId } as PaymentRowInsert);
  if (!payment?.id) return { code: 500 as const, error: "payment_create_failed" };
  if (doc.after_payment_insert) await doc.after_payment_insert(payment.id);

  let applicationsCount = 0;
  for (const application of doc.applications) {
    const refused = await doc.validate_application(application);
    // Lead 03:22Z — atomic: a refused application rolls the WHOLE payment back (row, number, earlier applications,
    // attachments). Thrown, not returned, so the caller's transaction aborts; the route answers with the same status/body.
    if (refused) throw new PaymentApplicationRefusedError(refused.code, refused.error);
    await insertPaymentApplicationRowInClientTx(client, {
      operating_company_id: oci,
      payment_id: payment.id,
      target_kind: "invoice",
      target_id: application.invoice_id,
      amount_cents: application.amount_cents,
      user_id: doc.row.created_by_user_id,
    });
    applicationsCount += 1;
  }

  await postCustomerPaymentOrRecordSkipInClientTx(client, {
    operating_company_id: oci,
    payment_id: payment.id,
    user_id: doc.row.created_by_user_id,
    skip_context: { payment_id: payment.id, ...doc.skip_context },
  });

  const refreshedRes = await client.query(
    `SELECT amount_unapplied_cents FROM accounting.payments WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`,
    [payment.id, oci]
  );
  const refreshed = refreshedRes.rows[0] ?? { amount_unapplied_cents: 0 };

  if (doc.before_audit) await doc.before_audit(payment.id);

  await appendCrudAudit(
    client,
    doc.row.created_by_user_id,
    doc.audit.action,
    {
      resource_type: "accounting.payments",
      resource_id: payment.id,
      operating_company_id: oci,
      customer_id: doc.row.customer_id,
      display_id: payment.display_id,
      applications_count: applicationsCount,
    },
    "info",
    doc.audit.module
  );

  // ACCOUNTING-SPINE-EVENT-FIRE-AND-FORGET-SILENT-DROP: in the payment's own creation transaction, awaited, so the write
  // and its spine event can never diverge.
  await emitAccountingSpineEvent(client, {
    operating_company_id: oci,
    actor_user_id: String(doc.row.created_by_user_id),
    event_type: doc.spine.event_type,
    entity_id: payment.id,
    entity_type: doc.spine.entity_type,
    source_table: "accounting.payments",
  });

  return {
    code: 201 as const,
    data: {
      id: payment.id,
      display_id: payment.display_id,
      amount_unapplied_cents: Number(refreshed.amount_unapplied_cents ?? 0),
      applications_count: applicationsCount,
    },
  };
}

/**
 * The Receive Payment form's "next number" preview (GET /api/v1/accounting/payments/next-number) — a suggestion, nothing is
 * written. It lives with the engine so every payment-number call stays in one module (guard 18481 payments deep).
 */
export function suggestNextPaymentDisplayId(client: PaymentEngineClient, operatingCompanyId: string) {
  return nextPaymentDisplayId(client as never, operatingCompanyId);
}
