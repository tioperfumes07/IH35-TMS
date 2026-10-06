/**
 * LST-F414 — the ONE vendor-credit writer.
 *
 * ROUND 393.1 (trg_ap_control_written_only_by_documents, 202615380200) makes A/P writable only by a bill, a bill payment,
 * a vendor credit or settlement deductions. Every poster that reduces what is owed to a vendor therefore has to issue a
 * vendor credit — the insurance cancellation refund, the pending refund-obligation drain and the fleet-remove credit
 * used to write raw `insurance_policy` journal lines on ap_control, which that rule now refuses at write time. They and
 * POST /api/v1/accounting/vendor-credits all create the document here, on the caller's transaction: insert, number,
 * post (Dr A/P / Cr the named account) and audit, or roll back together.
 */
import { appendCrudAudit } from "../audit/crud-audit.js";
import { resolveVendorCreditDisplayId } from "./display-id.js";
import { postSourceTransactionInClientTx } from "./posting-engine.service.js";

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number | null }>;
};

export type VendorCreditCreateErrorCode = "vendor_not_found" | "account_not_postable_for_company" | "vendor_credit_create_failed";

export class VendorCreditCreateError extends Error {
  constructor(
    public readonly code: VendorCreditCreateErrorCode,
    message: string
  ) {
    super(message);
    this.name = "VendorCreditCreateError";
  }
}

export type CreateVendorCreditInput = {
  operatingCompanyId: string;
  vendorId: string;
  /** YYYY-MM-DD */
  issueDate: string;
  amountCents: number;
  /** The account the credit reduces (Cr side); Dr is always the company's A/P control. */
  accountId: string;
  notes?: string | null;
  /** Operator-typed number; omitted → next VC-YYYY-NNNNN. */
  displayId?: string | null;
  userId: string;
};

export type VendorCreditRow = {
  id: string;
  display_id: string;
  status: string;
  issue_date: string;
  amount_cents: number;
  amount_unapplied_cents: number;
  account_id: string;
  journal_entry_id: string | null;
};

export async function createVendorCreditInClientTx(client: Queryable, input: CreateVendorCreditInput): Promise<VendorCreditRow> {
  const vendorRes = await client.query(
    `SELECT id FROM mdata.vendors WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`,
    [input.vendorId, input.operatingCompanyId]
  );
  if (!vendorRes.rows[0]) throw new VendorCreditCreateError("vendor_not_found", "This vendor does not exist in this company.");

  // ROUND 373.4 — the account must be this company's, active and postable; never guessed, never defaulted.
  const acctRes = await client.query(
    `SELECT id FROM catalogs.accounts
      WHERE id = $1::uuid AND operating_company_id = $2::uuid AND deactivated_at IS NULL AND COALESCE(is_postable, true)
      LIMIT 1`,
    [input.accountId, input.operatingCompanyId]
  );
  if (!acctRes.rows[0]) {
    throw new VendorCreditCreateError("account_not_postable_for_company", "The credit's account is not an active, postable account of this company.");
  }

  // Canonical generator (same advisory-lock + MAX pattern as invoices/payments/credit memos).
  const displayId = await resolveVendorCreditDisplayId(
    client as never,
    input.operatingCompanyId,
    new Date(`${input.issueDate}T00:00:00Z`),
    input.displayId ?? undefined
  );

  const insRes = await client.query<VendorCreditRow>(
    `INSERT INTO accounting.vendor_credits
       (operating_company_id, vendor_id, display_id, issue_date, amount_cents, notes, created_by_user_id, account_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::uuid)
     RETURNING id::text, display_id, status, issue_date::text, amount_cents, amount_unapplied_cents, account_id::text`,
    [
      input.operatingCompanyId,
      input.vendorId,
      displayId,
      input.issueDate,
      input.amountCents,
      input.notes ?? null,
      input.userId,
      input.accountId,
    ]
  );
  const credit = insRes.rows[0];
  if (!credit) throw new VendorCreditCreateError("vendor_credit_create_failed", "The vendor credit could not be created.");

  // ROUND 373.4 — post on this transaction (Dr A/P / Cr the named account); a failure rolls the credit back.
  const posting = await postSourceTransactionInClientTx(
    client as never,
    { operating_company_id: input.operatingCompanyId, source_transaction_type: "vendor_credit", source_transaction_id: String(credit.id) },
    { userId: input.userId }
  );
  const jeId = (posting as { journal_entry_id?: string | null })?.journal_entry_id ?? null;
  if (jeId) {
    await client.query(`UPDATE accounting.vendor_credits SET journal_entry_id = $2::uuid WHERE id = $1::uuid`, [credit.id, jeId]);
  }
  credit.journal_entry_id = jeId;

  await appendCrudAudit(
    client as never,
    input.userId,
    "accounting.vendor_credits.created",
    { resource_type: "accounting.vendor_credits", resource_id: String(credit.id), display_id: displayId, vendor_id: input.vendorId },
    "info",
    "CUSTVEND-PAR-1"
  );
  return credit;
}
