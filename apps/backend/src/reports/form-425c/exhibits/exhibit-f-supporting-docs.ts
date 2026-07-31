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

export async function buildExhibitF(
  client: ExhibitQueryClient,
  input: ExhibitPeriod
): Promise<ExhibitF> {
  const documents: SupportingDocRow[] = [];

  const invoicesRes = await client.query<{
    id: string;
    display_id: string;
    total_cents: string;
    invoice_date: string;
  }>(
    `
      SELECT i.id, i.display_id, i.total_cents, i.issue_date::text AS invoice_date
      FROM accounting.invoices i
      WHERE i.operating_company_id = $1
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
      WHERE i.operating_company_id = $1
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
    documents.push({
      doc_type: "invoice",
      reference_id: String(row.display_id ?? row.id),
      evidence_uuid: null,
      label: `Invoice ${row.display_id}`,
      amount_cents: Number(row.total_cents ?? 0),
      doc_date: row.invoice_date ? String(row.invoice_date) : null,
    });
  }

  const billsRes = await client.query<{
    id: string;
    display_id: string;
    total_cents: string;
    bill_date: string;
  }>(
    `
      SELECT b.id, b.display_id, b.amount_cents AS total_cents, b.bill_date::text
      FROM accounting.bills b
      WHERE b.operating_company_id = $1
        AND b.bill_date >= $2::date
        AND b.bill_date <= $3::date
        AND b.voided_at IS NULL
      ORDER BY b.bill_date DESC
    `,
    [input.operating_company_id, input.period_start, input.period_end]
  );

  const billCountRes = await client.query<{ n: string }>(
    `
      SELECT count(*)::text AS n
      FROM accounting.bills b
      WHERE b.operating_company_id = $1
        AND b.bill_date >= $2::date
        AND b.bill_date <= $3::date
        AND b.voided_at IS NULL
    `,
    [input.operating_company_id, input.period_start, input.period_end]
  );

  assertNotTruncated("bills", billsRes.rows.length, input);
  assertComplete("bills", billsRes.rows.length, Number(billCountRes.rows[0]?.n ?? 0), input);

  for (const row of billsRes.rows) {
    documents.push({
      doc_type: "bill",
      reference_id: String(row.display_id ?? row.id),
      evidence_uuid: null,
      label: `Bill ${row.display_id}`,
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
