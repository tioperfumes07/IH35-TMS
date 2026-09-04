// SET-24 (owner order 2026-09-04). A broker-sent advance against a specific load's receivable --
// diesel, driver pay, or a repair when cash is tight. Drivers are B1 COMPANY drivers, not
// owner-operators, so the money reaching them (a Comchek) is a disbursement instrument, never
// driver pay and never a driver debt -- this file NEVER writes to driver_finance.driver_
// liabilities/driver_advances/settlement_lines. At delivery the factoring company purchases the
// receivable and advances the DIFFERENCE: the invoice face stays the full rate, the broker has
// prepaid part of it. So this is a PARTIAL PAYMENT against the receivable -- it reduces what the
// factor will purchase (accounting.invoices.broker_advance_applied_cents), never the invoice face
// (rate_total_cents / the line amounts), never a driver liability.
//
// LOAD-COSTS-COMPLETE item (2) (owner ruling 2026-09-04, verbatim): "the broker might send the
// driver money and we apply it as a bill payment to the driver." applyBrokerAdvanceToDriverBillInClientTx
// below is that SECOND event, distinct from the receipt/AR-reduction event above -- same
// instrument (one Comchek, two sides, one trace via disbursed_journal_entry_id on the SAME row),
// but this side settles part of an EXISTING driver_finance.driver_bills liability via a real,
// balanced JE (DR Driver Settlements Payable / CR Accounts Receivable) through
// journal-entries.service. Still never touches driver_liabilities/driver_advances/settlement_lines
// -- a driver_bills row already exists from booking; this only reduces how much of it is still
// owed, it never creates a new liability or a settlement deduction.
import { appendCrudAudit } from "../audit/crud-audit.js";
import { createJournalEntryOnClient } from "./journal-entries.service.js";
import { findConflictingInvoiceForLoad } from "./from-load.js";
import { resolveRoleAccount } from "./coa-roles/resolver.service.js";

const DRIVER_SETTLEMENTS_PAYABLE_ACCOUNT_NUMBER = "2200";
const ACCOUNTS_RECEIVABLE_ACCOUNT_NUMBER = "1100";

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

export type DisburseBrokerAdvanceToDriverBillInput = {
  operatingCompanyId: string;
  brokerAdvanceId: string;
  driverBillId: string;
  /** Capped below at both the advance's own remaining amount and the bill's remaining balance -- never trusted at face value. */
  amountCents: number;
  actorUserId: string;
};

export type DisburseBrokerAdvanceToDriverBillResult = {
  disbursedAmountCents: number;
  journalEntryId: string;
};

async function resolveAccountId(client: Queryable, operatingCompanyId: string, accountNumber: string): Promise<string> {
  const res = await client.query<{ id: string }>(
    `SELECT id FROM catalogs.accounts WHERE operating_company_id = $1::uuid AND account_number = $2 LIMIT 1`,
    [operatingCompanyId, accountNumber]
  );
  const id = res.rows[0]?.id;
  if (!id) throw new BrokerAdvanceError("gl_account_not_found", `catalogs.accounts has no account_number=${accountNumber} for this company`);
  return String(id);
}

/**
 * LOAD-COSTS-COMPLETE item (2) -- the broker paid the driver directly (a Comchek/EFT the driver
 * cashed), so we record it as a bill payment against the driver's EXISTING driver_finance.
 * driver_bills liability, funded by the broker, linked to the SAME broker_advances receipt row.
 * NEVER driver pay, NEVER a driver debt, NEVER a settlement deduction -- this reduces what an
 * ALREADY-EXISTING driver_bills row still owes; it creates no new liability anywhere.
 *
 * Double entry, through journal-entries.service, or it does not post (owner's own words) --
 * DR Driver Settlements Payable (2200) / CR (Accounts Receivable OR Broker/Customer Advance
 * Liability -- see below). No cash account moves: economically the broker's direct payment to the
 * driver simultaneously reduces what the customer/broker owes us AND what we owe the driver,
 * netting through a third party with zero cash of ours touched.
 *
 * LOAD-COSTS-COMPLETE item (4) (owner correction 2026-09-04): the credit leg is CONDITIONAL on
 * whether an invoice exists for this load yet. Crediting Accounts Receivable unconditionally --
 * including when broker_advances.applied_to_invoice_id IS NULL -- posted against a receivable that
 * does not exist yet (this load's own file comment already called that state "honest": "an honest
 * 'received before first pickup' state"). Pre-invoice, this nets against the
 * broker_customer_advance_liability role instead (ND-INV-01's purpose-built, previously-orphaned
 * role -- admitted at the DB CHECK level and in the frontend CoaRoles enum since ND-INV-01 but never
 * wired into the backend resolver until this fix); buildInvoiceFromLoad (from-load.ts)
 * reclassifies it into Accounts Receivable the moment an invoice is first minted for the load, per
 * the §3 two-event latch.
 */
export async function applyBrokerAdvanceToDriverBillInClientTx(
  client: Queryable,
  input: DisburseBrokerAdvanceToDriverBillInput
): Promise<DisburseBrokerAdvanceToDriverBillResult> {
  if (!Number.isFinite(input.amountCents) || input.amountCents <= 0) {
    throw new BrokerAdvanceError("amount_must_be_positive", "amountCents must be a positive integer");
  }

  const hasColumnsRes = await client.query<{ ok: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'accounting' AND table_name = 'broker_advances'
          AND column_name = 'disbursed_to_driver_bill_id'
      ) AS ok
    `
  );
  if (!Boolean(hasColumnsRes.rows[0]?.ok)) {
    throw new BrokerAdvanceError(
      "disbursement_columns_not_migrated",
      "migration 202613700001 has not been applied yet -- broker-driver disbursement is unavailable until it lands"
    );
  }

  const advanceRes = await client.query<{
    category: string;
    amount_cents: string;
    disbursed_amount_cents: string | null;
    voided_at: string | null;
    load_id: string;
    instrument_reference: string;
    received_at: string;
    applied_to_invoice_id: string | null;
    invoice_status: string | null;
  }>(
    `SELECT ba.category, ba.amount_cents::text, ba.disbursed_amount_cents::text, ba.voided_at::text,
            ba.load_id::text, ba.instrument_reference, ba.received_at::date::text AS received_at,
            ba.applied_to_invoice_id::text, inv.status AS invoice_status
       FROM accounting.broker_advances ba
       LEFT JOIN accounting.invoices inv
         ON inv.id = ba.applied_to_invoice_id AND inv.operating_company_id = ba.operating_company_id
      WHERE ba.id = $1::uuid AND ba.operating_company_id = $2::uuid
      LIMIT 1`,
    [input.brokerAdvanceId, input.operatingCompanyId]
  );
  const advance = advanceRes.rows[0];
  if (!advance) throw new BrokerAdvanceError("broker_advance_not_found");
  if (advance.voided_at) throw new BrokerAdvanceError("broker_advance_voided", "cannot disburse a voided advance");
  if (advance.category !== "driver_pay") {
    throw new BrokerAdvanceError(
      "wrong_category_for_driver_disbursement",
      `broker_advances.category must be 'driver_pay' to disburse to a driver bill, got '${advance.category}'`
    );
  }
  if (advance.disbursed_amount_cents != null) {
    throw new BrokerAdvanceError("already_disbursed", "this broker advance already has a driver-bill disbursement recorded");
  }
  const advanceRemainingCents = Math.round(Number(advance.amount_cents));

  const billRes = await client.query<{ id: string; driver_id: string; load_id: string; gross_amount_cents: string; status: string }>(
    `SELECT id, driver_id::text, load_id::text, gross_amount_cents::text, status
       FROM driver_finance.driver_bills
      WHERE id = $1::uuid AND operating_company_id = $2::uuid
      LIMIT 1`,
    [input.driverBillId, input.operatingCompanyId]
  );
  const bill = billRes.rows[0];
  if (!bill) throw new BrokerAdvanceError("driver_bill_not_found");
  if (bill.status === "void") throw new BrokerAdvanceError("driver_bill_voided", "cannot disburse against a voided driver bill");
  if (bill.load_id !== advance.load_id) {
    throw new BrokerAdvanceError(
      "load_mismatch",
      "the driver bill and the broker advance must be for the same load -- this is one instrument settling one load's driver pay, not a cross-load transfer"
    );
  }

  const priorDisbursedRes = await client.query<{ covered: string }>(
    `SELECT COALESCE(SUM(disbursed_amount_cents), 0)::text AS covered
       FROM accounting.broker_advances
      WHERE operating_company_id = $1::uuid AND disbursed_to_driver_bill_id = $2::uuid`,
    [input.operatingCompanyId, input.driverBillId]
  );
  const billRemainingCents = Math.max(0, Math.round(Number(bill.gross_amount_cents)) - Math.round(Number(priorDisbursedRes.rows[0]!.covered)));

  const disbursedAmountCents = Math.min(input.amountCents, advanceRemainingCents, billRemainingCents);
  if (disbursedAmountCents <= 0) {
    throw new BrokerAdvanceError(
      "nothing_to_disburse",
      `disbursement would be zero -- advance remaining=${advanceRemainingCents}, bill remaining=${billRemainingCents}, requested=${input.amountCents}`
    );
  }

  const payableAccountId = await resolveAccountId(client, input.operatingCompanyId, DRIVER_SETTLEMENTS_PAYABLE_ACCOUNT_NUMBER);
  // LOAD-COSTS-COMPLETE item (4) (owner correction 2026-09-04): only net against Accounts
  // Receivable when a receivable ACTUALLY EXISTS for this load. `applied_to_invoice_id` alone is not
  // enough -- ND-INV-01's proforma invoice is explicitly NON-POSTING ("Pro Forma is NON-POSTING
  // (status=proforma). Official invoice posts A/R only after POD convert" -- from-load.ts /
  // proforma-convert.service.ts), so a load whose only invoice is still a proforma has NO A/R row to
  // reduce either. Pre-invoice AND pre-conversion both land on the Broker/Customer Advance Liability
  // role; a receivable only exists once the invoice has left proforma status.
  const hasPostedReceivable = advance.applied_to_invoice_id != null && advance.invoice_status !== "proforma" && advance.invoice_status !== "void";
  const creditAccountId = hasPostedReceivable
    ? await resolveAccountId(client, input.operatingCompanyId, ACCOUNTS_RECEIVABLE_ACCOUNT_NUMBER)
    : await resolveRoleAccount(client as never, input.operatingCompanyId, "broker_customer_advance_liability");
  const creditDescription = hasPostedReceivable
    ? "Receivable reduced -- broker prepaid this portion directly to the driver"
    : "Customer-deposit liability recorded -- no posted receivable exists yet for this load (no invoice, or still proforma); reclassify into Accounts Receivable once the invoice posts A/R";

  const je = await createJournalEntryOnClient(
    client as never,
    {
      operating_company_id: input.operatingCompanyId,
      entry_date: advance.received_at,
      memo: `Broker advance ${advance.instrument_reference} disbursed directly to driver, settling driver bill ${input.driverBillId}`,
      source: "manual",
      postings: [
        {
          account_id: payableAccountId,
          debit_or_credit: "debit",
          amount_cents: disbursedAmountCents,
          entity_uuid: bill.driver_id,
          entity_type: "driver",
          description: "Driver bill settled by broker's direct advance to the driver",
        },
        {
          account_id: creditAccountId,
          debit_or_credit: "credit",
          amount_cents: disbursedAmountCents,
          description: creditDescription,
        },
      ],
    },
    { userId: input.actorUserId, role: "system" }
  );

  await client.query(
    `UPDATE accounting.broker_advances
        SET disbursed_to_driver_bill_id = $2::uuid,
            disbursed_amount_cents = $3,
            disbursed_journal_entry_id = $4::uuid,
            updated_at = now()
      WHERE id = $1::uuid`,
    [input.brokerAdvanceId, input.driverBillId, disbursedAmountCents, je.id]
  );

  await appendCrudAudit(
    client as never,
    input.actorUserId,
    "accounting.broker_advance.disbursed_to_driver_bill",
    {
      resource_type: "accounting.broker_advances",
      resource_id: input.brokerAdvanceId,
      operating_company_id: input.operatingCompanyId,
      driver_bill_id: input.driverBillId,
      driver_id: bill.driver_id,
      disbursed_amount_cents: disbursedAmountCents,
      journal_entry_id: je.id,
    },
    "info",
    "LOAD-COSTS-COMPLETE-item-2"
  );

  return { disbursedAmountCents, journalEntryId: String(je.id) };
}
