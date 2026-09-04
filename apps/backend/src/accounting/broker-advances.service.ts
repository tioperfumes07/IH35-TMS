// SET-24 (owner order 2026-09-04). A broker-sent advance against a specific load's receivable --
// diesel, driver pay, or a repair when cash is tight. Drivers are B1 COMPANY drivers, not
// owner-operators, so the money reaching them (a Comchek) is a disbursement instrument, never
// driver pay and never a driver debt -- this file NEVER writes to driver_finance.*. At delivery
// the factoring company purchases the receivable and advances the DIFFERENCE: the invoice face
// stays the full rate, the broker has prepaid part of it. So this is a PARTIAL PAYMENT against the
// receivable -- it reduces what the factor will purchase (accounting.invoices.
// broker_advance_applied_cents), never the invoice face (rate_total_cents / the line amounts),
// never a driver liability.
import { appendCrudAudit } from "../audit/crud-audit.js";
import { findConflictingInvoiceForLoad } from "./from-load.js";

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export const BROKER_ADVANCE_CATEGORIES = ["diesel", "driver_pay", "repair", "other"] as const;
export type BrokerAdvanceCategory = (typeof BROKER_ADVANCE_CATEGORIES)[number];

export class BrokerAdvanceError extends Error {
  constructor(
    readonly code: string,
    message?: string
  ) {
    super(message ?? code);
    this.name = "BrokerAdvanceError";
  }
}

export type RecordBrokerAdvanceInput = {
  operatingCompanyId: string;
  loadId: string;
  customerId: string;
  category: BrokerAdvanceCategory;
  instrumentType: string;
  /** Comchek number / EFTPS / wire reference. Required, never prefilled -- the caller must supply a real value. */
  instrumentReference: string;
  amountCents: number;
  receivedAt: string;
  notes?: string | null;
  actorUserId: string;
};

export type RecordBrokerAdvanceResult = {
  brokerAdvanceId: string;
  appliedToInvoiceId: string | null;
};

/**
 * The one write path for a broker advance receipt. Validates the required fields at the service
 * boundary (not just the UI, per BLOCK-B rule 6 -- "the tab calls the SAME endpoint," and a
 * required field enforced only in React is not enforced at all), inserts the receipt row, and --
 * if a live (non-void) invoice already exists for this load -- applies it immediately into
 * broker_advance_applied_cents in the SAME transaction. If no invoice exists yet, the row is left
 * unapplied (applied_to_invoice_id NULL, an honest "received before first pickup" state);
 * buildInvoiceFromLoad (from-load.ts) claims every unapplied row for a load the moment an invoice
 * is first minted for it, so this is never silently lost regardless of arrival order.
 */
export async function recordBrokerAdvanceInClientTx(
  client: Queryable,
  input: RecordBrokerAdvanceInput
): Promise<RecordBrokerAdvanceResult> {
  if (!BROKER_ADVANCE_CATEGORIES.includes(input.category)) {
    throw new BrokerAdvanceError("invalid_category", `category must be one of ${BROKER_ADVANCE_CATEGORIES.join(", ")}`);
  }
  if (!input.instrumentType?.trim()) {
    throw new BrokerAdvanceError("instrument_type_required", "instrumentType is required");
  }
  if (!input.instrumentReference?.trim()) {
    throw new BrokerAdvanceError(
      "instrument_reference_required",
      "instrumentReference is required -- this number is what stops the same advance being recorded twice; it is never prefilled or defaulted"
    );
  }
  if (!Number.isFinite(input.amountCents) || input.amountCents <= 0) {
    throw new BrokerAdvanceError("amount_must_be_positive", "amountCents must be a positive integer");
  }

  const loadRes = await client.query<{ id: string }>(
    `SELECT id FROM mdata.loads WHERE id = $1::uuid AND operating_company_id = $2::uuid AND soft_deleted_at IS NULL LIMIT 1`,
    [input.loadId, input.operatingCompanyId]
  );
  if (!loadRes.rows[0]) throw new BrokerAdvanceError("load_not_found");

  const customerRes = await client.query<{ id: string }>(
    `SELECT id FROM mdata.customers WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
    [input.customerId, input.operatingCompanyId]
  );
  if (!customerRes.rows[0]) throw new BrokerAdvanceError("customer_not_found");

  const insertRes = await client.query<{ id: string }>(
    `
      INSERT INTO accounting.broker_advances (
        operating_company_id, load_id, customer_id, category, instrument_type,
        instrument_reference, amount_cents, received_at, notes, created_by_user_id
      ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9, $10::uuid)
      RETURNING id
    `,
    [
      input.operatingCompanyId,
      input.loadId,
      input.customerId,
      input.category,
      input.instrumentType.trim(),
      input.instrumentReference.trim(),
      input.amountCents,
      input.receivedAt,
      input.notes?.trim() || null,
      input.actorUserId,
    ]
  );
  const brokerAdvanceId = insertRes.rows[0]!.id;

  // Immediate-apply case: a live invoice already exists (this load's first pickup already minted
  // the proforma before the advance arrived). Additive only -- never overwrites, never touches
  // rate_total_cents or any invoice line amount.
  const liveInvoice = await findConflictingInvoiceForLoad(client as never, input.operatingCompanyId, input.loadId);
  let appliedToInvoiceId: string | null = null;
  if (liveInvoice?.id) {
    appliedToInvoiceId = String(liveInvoice.id);
    await client.query(
      `UPDATE accounting.invoices SET broker_advance_applied_cents = COALESCE(broker_advance_applied_cents, 0) + $2 WHERE id = $1`,
      [appliedToInvoiceId, input.amountCents]
    );
    await client.query(
      `UPDATE accounting.broker_advances SET applied_to_invoice_id = $2::uuid, applied_at = now(), updated_at = now() WHERE id = $1`,
      [brokerAdvanceId, appliedToInvoiceId]
    );
  }

  await appendCrudAudit(
    client as never,
    input.actorUserId,
    "accounting.broker_advance.received",
    {
      resource_type: "accounting.broker_advances",
      resource_id: brokerAdvanceId,
      operating_company_id: input.operatingCompanyId,
      load_id: input.loadId,
      customer_id: input.customerId,
      category: input.category,
      amount_cents: input.amountCents,
      applied_to_invoice_id: appliedToInvoiceId,
    },
    "info",
    "SET-24"
  );

  return { brokerAdvanceId, appliedToInvoiceId };
}
