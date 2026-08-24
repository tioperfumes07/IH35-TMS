import type { ExhibitPeriod, ExhibitQueryClient } from "./types.js";

export type SupportingDocRow = {
  doc_type: "invoice" | "bill" | "bank_statement" | "other";
  reference_id: string;
  evidence_uuid: string | null;
  label: string;
  amount_cents: number | null;
  doc_date: string | null;
};

export type ExhibitF = {
  letter: "f";
  title: string;
  period_start: string;
  period_end: string;
  documents: SupportingDocRow[];
  /**
   * The TRUE number of supporting documents for the period — reconciled against an independent
   * database count of each source before the exhibit is returned (see assertComplete). This is
   * never a truncated length; if the full set cannot be materialised the exhibit throws instead.
   */
  document_count: number;
  /** Per-source totals so the schedule ties out on its face without re-querying. */
  invoice_count: number;
  bill_count: number;
};

/**
 * Runaway-memory ceiling ONLY — it is NOT a business cap.
 *
 * Exhibit F is a supporting-documents schedule filed with the bankruptcy court. A schedule that
 * silently omits rows misrepresents the estate's records, so this file must never truncate: it
 * either lists every qualifying document for the period or it refuses to build.
 *
 * The previous `LIMIT 200` did truncate silently, and `document_count` reported the truncated
 * length as if it were the true count. Measured on prod 2026-07-31: 22 bill-months and 29
 * invoice-months exceeded 200 (worst 342 bills / 345 invoices), so 3,031 documents would have been
 * dropped from filings without any marker.
 *
 * The ceiling sits far above any observed monthly volume; breaching it means something is wrong
 * with the period input, and the correct response is to fail loudly rather than file a partial
 * schedule.
 */
export const EXHIBIT_F_MAX_ROWS = 25_000;

function assertNotTruncated(
  source: "invoices" | "bills",
  rowCount: number,
  input: ExhibitPeriod
): void {
  if (rowCount >= EXHIBIT_F_MAX_ROWS) {
    throw new Error(
      `Exhibit F ${source} returned ${rowCount} rows for ${input.period_start}..${input.period_end} ` +
        `(operating_company_id=${input.operating_company_id}), at or above the ${EXHIBIT_F_MAX_ROWS} safety ceiling. ` +
        `Refusing to build a supporting-documents schedule that may be incomplete — a court filing must never silently truncate.`
    );
  }
}

/**
 * Completeness must be PROVEN, not inferred from "we removed the LIMIT".
 *
 * The exhibit's document_count is what a signer, trustee or attorney reads as the number of
 * supporting documents. Previously it was documents.length computed AFTER a LIMIT 200, so the
 * truncated length was reported as the true count. Removing the cap makes that number correct
 * today, but nothing would catch a cap or pagination being reintroduced later.
 *
 * So each source is counted independently in the database and reconciled against the rows actually
 * materialised. Any shortfall fails the build. document_count is therefore the true period total by
 * construction, or no exhibit is produced at all.
 */
function assertComplete(
  source: "invoices" | "bills",
  materialised: number,
  expected: number,
  input: ExhibitPeriod
): void {
  if (materialised !== expected) {
    throw new Error(
      `Exhibit F ${source} is INCOMPLETE for ${input.period_start}..${input.period_end} ` +
        `(operating_company_id=${input.operating_company_id}): the database reports ${expected} qualifying ` +
        `records but only ${materialised} were returned (short by ${expected - materialised}). ` +
        `Refusing to produce a court supporting-documents schedule that under-reports — ` +
        `document_count must be the true total or the filing must not be generated.`
    );
  }
}

function formatUsd(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * The human-facing reference for a bill row on a court supporting-documents schedule.
 *
 * `bill_number` is the SEMANTICALLY CORRECT field here, not a workaround for a null column: it is
 * the vendor's own external reference (e.g. "13401-5723"), which is what a trustee, auditor or
 * creditor matches the schedule against. `accounting.bills.display_id` — which this previously read
 * — is NULL on all 16,236 bills on prod, so every bill row rendered as the literal string
 * "Bill null" with a raw uuid as its reference. An exhibit that identifies 180 documents that way
 * is not usable as evidence.
 *
 * When `bill_number` is absent (543 of 16,236 bills; 23 of the 180 in June 2026 TRANSP) the row is
 * described from the fields the record DOES have — vendor, date, amount. That is honest and
 * traceable: those three identify the document to anyone holding the vendor's records.
 *
 * What this must never emit, because each is a different way of lying on a court filing:
 *   - a raw uuid (an internal key is not a document reference)
 *   - the string "null" / "undefined"
 *   - a fabricated or sequential number that looks like a real vendor reference
 */
export function billReference(row: {
  bill_number: string | null;
  vendor_name: string | null;
  total_cents: string | number | null;
  bill_date: string | null;
}): string {
  const billNumber = row.bill_number?.trim();
  if (billNumber) return billNumber;

  const vendor = row.vendor_name?.trim() || "vendor not recorded";
  const date = row.bill_date ? String(row.bill_date) : "date not recorded";
  const amount = formatUsd(Number(row.total_cents ?? 0));
  return `— ${vendor}, ${date}, ${amount} (no vendor bill number on file)`;
}

/**
 * The human-facing reference for an invoice row — same standard as billReference() above, and the
 * exact same defect class: `label: \`Invoice ${row.display_id}\`` had no fallback when display_id
 * was null, so it would render the literal string "Invoice null" (String(undefined/null) coerces
 * that way in a template literal) the first time an invoice without a display_id reached this
 * exhibit. Unreachable against prod data TODAY (accounting.invoices has 0 rows system-wide as of
 * this fix — verified via Neon), but this is the identical latent bug billReference() was written
 * to close for bills, in the same file, and must not regress the next time an invoice is created.
 */
export function invoiceReference(row: {
  display_id: string | null;
  customer_name: string | null;
  total_cents: string | number | null;
  invoice_date: string | null;
}): string {
  const displayId = row.display_id?.trim();
  if (displayId) return displayId;

  const customer = row.customer_name?.trim() || "customer not recorded";
  const date = row.invoice_date ? String(row.invoice_date) : "date not recorded";
  const amount = formatUsd(Number(row.total_cents ?? 0));
  return `— ${customer}, ${date}, ${amount} (no invoice number on file)`;
}

export async function buildExhibitF(
  client: ExhibitQueryClient,
  input: ExhibitPeriod
): Promise<ExhibitF> {
  const documents: SupportingDocRow[] = [];

  const invoicesRes = await client.query<{
    id: string;
    display_id: string | null;
    customer_name: string | null;
    total_cents: string;
    invoice_date: string;
  }>(
    `
      SELECT i.id, i.display_id, c.customer_name, i.total_cents, i.issue_date::text AS invoice_date
      FROM accounting.invoices i
      LEFT JOIN mdata.customers c
        ON c.id = i.customer_id
       AND c.operating_company_id = i.operating_company_id
      WHERE i.operating_company_id = $1::uuid
        AND i.issue_date >= $2::date
        AND i.issue_date <= $3::date
        AND i.voided_at IS NULL
      ORDER BY i.issue_date DESC
    `,
    [input.operating_company_id, input.period_start, input.period_end]
  );

  const invoiceCountRes = await client.query<{ n: string }>(
    `
      SELECT count(*)::text AS n
      FROM accounting.invoices i
      WHERE i.operating_company_id = $1::uuid
        AND i.issue_date >= $2::date
        AND i.issue_date <= $3::date
        AND i.voided_at IS NULL
    `,
    [input.operating_company_id, input.period_start, input.period_end]
  );

  assertNotTruncated("invoices", invoicesRes.rows.length, input);
  assertComplete(
    "invoices",
    invoicesRes.rows.length,
    Number(invoiceCountRes.rows[0]?.n ?? 0),
    input
  );

  for (const row of invoicesRes.rows) {
    const ref = invoiceReference(row);
    documents.push({
      doc_type: "invoice",
      reference_id: ref,
      evidence_uuid: null,
      label: `Invoice ${ref}`,
      amount_cents: Number(row.total_cents ?? 0),
      doc_date: row.invoice_date ? String(row.invoice_date) : null,
    });
  }

  const billsRes = await client.query<{
    id: string;
    bill_number: string | null;
    vendor_name: string | null;
    total_cents: string;
    bill_date: string;
  }>(
    `
      SELECT b.id,
             b.bill_number,
             qv.display_name AS vendor_name,
             b.amount_cents AS total_cents,
             b.bill_date::text
      FROM accounting.bills b
      LEFT JOIN mdata.qbo_vendors qv
        ON qv.qbo_id = b.vendor_id
       AND qv.operating_company_id = b.operating_company_id
      WHERE b.operating_company_id = $1::uuid
        AND b.bill_date >= $2::date
        AND b.bill_date <= $3::date
        -- ACCT-F202: voidBill() writes revoked_at, never voided_at. Filtering voided_at alone put
        -- VOIDED bills into a Chapter 11 monthly operating report as live liabilities.
        AND b.revoked_at IS NULL
        AND b.voided_at IS NULL
      ORDER BY b.bill_date DESC
    `,
    [input.operating_company_id, input.period_start, input.period_end]
  );

  const billCountRes = await client.query<{ n: string }>(
    `
      SELECT count(*)::text AS n
      FROM accounting.bills b
      WHERE b.operating_company_id = $1::uuid
        AND b.bill_date >= $2::date
        AND b.bill_date <= $3::date
        -- ACCT-F202: voidBill() writes revoked_at, never voided_at. Filtering voided_at alone put
        -- VOIDED bills into a Chapter 11 monthly operating report as live liabilities.
        AND b.revoked_at IS NULL
        AND b.voided_at IS NULL
    `,
    [input.operating_company_id, input.period_start, input.period_end]
  );

  assertNotTruncated("bills", billsRes.rows.length, input);
  assertComplete("bills", billsRes.rows.length, Number(billCountRes.rows[0]?.n ?? 0), input);

  for (const row of billsRes.rows) {
    const ref = billReference(row);
    documents.push({
      doc_type: "bill",
      reference_id: ref,
      evidence_uuid: null,
      label: `Bill ${ref}`,
      amount_cents: Number(row.total_cents ?? 0),
      doc_date: row.bill_date ? String(row.bill_date) : null,
    });
  }

  return {
    letter: "f",
    title: "Exhibit F — Supporting documentation list",
    period_start: input.period_start,
    period_end: input.period_end,
    documents,
    document_count: documents.length,
    invoice_count: invoicesRes.rows.length,
    bill_count: billsRes.rows.length,
  };
}
