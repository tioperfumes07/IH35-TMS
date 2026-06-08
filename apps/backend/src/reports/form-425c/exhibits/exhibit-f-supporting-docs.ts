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
  document_count: number;
};

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
      SELECT i.id, i.display_id, i.total_cents, i.invoice_date::text
      FROM accounting.invoices i
      WHERE i.operating_company_id = $1
        AND i.invoice_date >= $2::date
        AND i.invoice_date <= $3::date
        AND i.soft_deleted_at IS NULL
      ORDER BY i.invoice_date DESC
      LIMIT 200
    `,
    [input.operating_company_id, input.period_start, input.period_end]
  ).catch(() => ({ rows: [] }));

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
      SELECT b.id, b.display_id, b.total_cents, b.bill_date::text
      FROM accounting.bills b
      WHERE b.operating_company_id = $1
        AND b.bill_date >= $2::date
        AND b.bill_date <= $3::date
        AND b.soft_deleted_at IS NULL
      ORDER BY b.bill_date DESC
      LIMIT 200
    `,
    [input.operating_company_id, input.period_start, input.period_end]
  ).catch(() => ({ rows: [] }));

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
  };
}
