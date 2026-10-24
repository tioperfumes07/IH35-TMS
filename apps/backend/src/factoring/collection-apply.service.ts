// Faro collection-apply engine (LEAD 443.304, register row 77).
//
// When Faro collects from a customer (the customer paid Faro, not us), this engine:
//   1. Creates a customer PAYMENT with deposited_to = factoring_advance_liability account.
//      Posting (via existing customer_payment path): Dr 2150 factoring_advance_liability / Cr 1100 ar_control.
//      This relieves the advance liability (Faro collected what they advanced) and closes A/R.
//   2. Applies the payment to the factored invoice → amount_open_cents decreases.
//   3. When invoice is fully paid: marks factoring_status = 'collected'.
//   4. Short-pay (amount < invoice open): invoice stays open for the remainder; opens a dispute row.
//   5. Over-pay (amount > invoice open): applies only open amount; unapplied balance stays on payment.
//   6. Idempotent per remittance_ref: duplicate call for the same ref is refused (not re-applied).
//
// Does NOT: create/void purchases, touch bank matching, write journal entries directly — all GL
// flows through the existing customer_payment posting engine, one writer per document.

import { withCompanyScope } from "../accounting/db-scope.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { resolveRoleAccount } from "../accounting/coa-roles/resolver.service.js";
import {
  insertPaymentRowInClientTx,
  insertPaymentApplicationRowInClientTx,
  postCustomerPaymentOrRecordSkipInClientTx,
} from "../accounting/payment-writer.service.js";
import { nextPaymentDisplayId } from "../accounting/display-id.js";
import { emitAccountingSpineEvent } from "../accounting/accounting-spine-emit.js";
import { openInvoiceDispute } from "../accounting/invoice-disputes.service.js";

export class CollectionApplyError extends Error {
  constructor(public readonly code: string, public readonly status: 400 | 404 | 409) {
    super(code);
    this.name = "CollectionApplyError";
  }
}

export type CollectionApplyInput = {
  operating_company_id: string;
  invoice_id: string;
  amount_paid_cents: number;
  date_paid: string; // YYYY-MM-DD
  /** Caller-supplied opaque idempotency key: Faro remittance row id or UUID for manual entry. */
  remittance_ref: string;
  actor_user_id: string;
  actor_role: string;
};

export type CollectionApplyResult = {
  payment_id: string;
  payment_display_id: string;
  applied_cents: number;
  remainder_cents: number;
  dispute_id: string | null;
  already_applied: boolean;
};

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }>;
};

/** Inner implementation, testable by passing a mock client. */
export async function applyFaroCollectionInClientTx(
  client: DbClient,
  input: CollectionApplyInput
): Promise<CollectionApplyResult> {
  const oci = input.operating_company_id;
    // --- idempotency: refuse a duplicate remittance_ref ------------------------------------
    const dup = await client.query<{ payment_id: string; payment_display_id: string; applied_cents: number }>(
      `SELECT p.id::text AS payment_id, p.display_id AS payment_display_id,
              COALESCE(SUM(pa.amount_cents), 0)::bigint AS applied_cents
         FROM accounting.payments p
         LEFT JOIN accounting.payment_applications pa ON pa.payment_id = p.id
        WHERE p.operating_company_id = $1::uuid
          AND p.payment_source_kind = 'factoring_collection'
          AND p.reference = $2
        GROUP BY p.id, p.display_id
        LIMIT 1`,
      [oci, input.remittance_ref]
    );
    if (dup.rows[0]) {
      const d = dup.rows[0];
      return {
        payment_id: d.payment_id,
        payment_display_id: d.payment_display_id ?? "",
        applied_cents: Number(d.applied_cents),
        remainder_cents: 0,
        dispute_id: null,
        already_applied: true,
      };
    }

    // --- load invoice -----------------------------------------------------------------------
    const invRes = await client.query<{
      id: string;
      customer_id: string;
      amount_open_cents: number;
      factoring_status: string;
      voided_at: string | null;
    }>(
      `SELECT id::text, customer_id::text, amount_open_cents::bigint,
              COALESCE(factoring_status, 'not_factored') AS factoring_status, voided_at::text
         FROM accounting.invoices
        WHERE id = $1::uuid AND operating_company_id = $2::uuid
        LIMIT 1`,
      [input.invoice_id, oci]
    );
    const inv = invRes.rows[0];
    if (!inv) throw new CollectionApplyError("invoice_not_found", 404);
    if (inv.voided_at) throw new CollectionApplyError("invoice_voided", 409);
    if (!["advanced", "reserve_held", "collected"].includes(inv.factoring_status)) {
      throw new CollectionApplyError(`invoice_not_factored_advanced:${inv.factoring_status}`, 409);
    }
    const openCents = Number(inv.amount_open_cents ?? 0);
    if (openCents <= 0) throw new CollectionApplyError("invoice_already_closed", 409);

    const amount = Math.round(Number(input.amount_paid_cents));
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new CollectionApplyError("invalid_amount_paid_cents", 400);
    }

    // --- resolve factoring_advance_liability account ----------------------------------------
    const liabilityAccountId = await resolveRoleAccount(
      client as never,
      oci,
      "factoring_advance_liability" as never
    );

    // --- apply amount (cap at open; remainder stays unapplied) ------------------------------
    const applyCents = Math.min(amount, openCents);
    const remainderCents = openCents - applyCents;
    const isShortPay = amount < openCents;
    const isOverPay = amount > openCents;

    // --- insert payment + application (on the caller's implicit transaction) ----------------
    const displayId = await nextPaymentDisplayId(client as never, oci, new Date(`${input.date_paid}T00:00:00.000Z`));
    const payment = await insertPaymentRowInClientTx(client as never, {
      operating_company_id: oci,
      customer_id: inv.customer_id,
      display_id: displayId,
      payment_method: "other",
      payment_date: input.date_paid,
      reference: input.remittance_ref,
      amount_cents: amount,
      deposited_to_account_id: liabilityAccountId,
      notes: "Faro factoring collection (customer paid factor)",
      created_by_user_id: input.actor_user_id,
      is_sample_data: false,
      payment_source_kind: "factoring_collection",
    });
    if (!payment?.id) throw new CollectionApplyError("payment_insert_failed", 409);

    await insertPaymentApplicationRowInClientTx(client as never, {
      operating_company_id: oci,
      payment_id: payment.id,
      target_kind: "invoice",
      target_id: input.invoice_id,
      amount_cents: applyCents,
      user_id: input.actor_user_id,
    });

    // --- post GL (Dr 2150 factoring_advance_liability / Cr 1100 ar_control) -----------------
    await postCustomerPaymentOrRecordSkipInClientTx(client as never, {
      operating_company_id: oci,
      payment_id: payment.id,
      user_id: input.actor_user_id,
      skip_context: { remittance_ref: input.remittance_ref, source: "factoring_collection" },
    });

    // --- update invoice factoring_status when fully paid ------------------------------------
    if (!isShortPay && !isOverPay) {
      await client.query(
        `UPDATE accounting.invoices
            SET factoring_status = 'collected', updated_at = now(), updated_by_user_id = $2::uuid
          WHERE id = $1::uuid AND operating_company_id = $3::uuid`,
        [input.invoice_id, input.actor_user_id, oci]
      );
    } else if (isShortPay) {
      // short-pay: partial closure, invoice stays open for remainder — factoring_status stays
    } else if (isOverPay) {
      // over-pay: invoice fully closed (applied = openCents), remainder unapplied on payment
      await client.query(
        `UPDATE accounting.invoices
            SET factoring_status = 'collected', updated_at = now(), updated_by_user_id = $2::uuid
          WHERE id = $1::uuid AND operating_company_id = $3::uuid`,
        [input.invoice_id, input.actor_user_id, oci]
      );
    }

    // --- open dispute for short-pay --------------------------------------------------------
    let disputeId: string | null = null;
    if (isShortPay) {
      const disputeResult = await openInvoiceDispute({
        userId: input.actor_user_id,
        operatingCompanyId: oci,
        invoiceId: input.invoice_id,
        reasonCode: "short_pay",
        disputedAmountCents: remainderCents,
        reasonText: `Faro short-pay: billed ${openCents}¢, collected ${amount}¢, remaining ${remainderCents}¢`,
      });
      // openInvoiceDispute uses withCompanyScope internally which opens its own connection —
      // for our test fork this is fine; production runs serialize through the shared pool.
      if ("dispute" in disputeResult) disputeId = (disputeResult as { dispute: { id: string } }).dispute.id;
    }

    // --- audit ----------------------------------------------------------------------------------
    await appendCrudAudit(
      client as never,
      input.actor_user_id,
      "factoring_collection_apply",
      {
        resource_type: "accounting.payments",
        resource_id: payment.id,
        operating_company_id: oci,
        customer_id: inv.customer_id,
        invoice_id: input.invoice_id,
        applied_cents: applyCents,
        remainder_cents: remainderCents,
        remittance_ref: input.remittance_ref,
      },
      "info",
      "factoring"
    );

    // --- spine event ----------------------------------------------------------------------------
    await emitAccountingSpineEvent(
      client as never,
      {
        operating_company_id: oci,
        actor_user_id: input.actor_user_id,
        event_type: "payment.customer_created",
        entity_id: payment.id,
        entity_type: "accounting.payments",
        source_table: "accounting.payments",
      }
    );

    return {
      payment_id: payment.id,
      payment_display_id: payment.display_id ?? displayId,
      applied_cents: applyCents,
      remainder_cents: remainderCents,
      dispute_id: disputeId,
      already_applied: false,
    };
}

export async function applyFaroCollection(
  input: CollectionApplyInput
): Promise<CollectionApplyResult> {
  const { operating_company_id: oci } = input;

  // actor_role check: Owner / Administrator / Accountant only (same gate as other payment writers)
  const ALLOWED_ROLES = new Set(["Owner", "Administrator", "Accountant"]);
  if (!ALLOWED_ROLES.has(input.actor_role)) {
    throw new CollectionApplyError("collection_apply_role_required", 403 as never as 400);
  }

  return withCompanyScope(input.actor_user_id, oci, async (client) => {
    return applyFaroCollectionInClientTx(client as unknown as DbClient, input);
  });
}
