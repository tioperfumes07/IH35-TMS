/**
 * FAIL-I1 / ACCT-F270 — re-sync draft|proforma linehaul amounts when a load's rate changes.
 * Shared so BOTH dispatch updateDispatchLoad AND mdata PATCH /loads/:id run the same wire
 * (dual-path: dispatch path already had it; mdata PATCH was the silent hole).
 *
 * Only draft/proforma + non-void. Never mutates sent/paid invoices. Reuses recomputeInvoiceTotals
 * — no new GL math.
 */
import { recomputeInvoiceTotals } from "./shared.js";

type DbClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export async function resyncProformaInvoiceFromLoadRate(
  client: DbClient,
  input: { loadId: string; operatingCompanyId: string; newRateTotalCents: number }
): Promise<string[]> {
  const newTotal = Number(input.newRateTotalCents ?? 0);
  if (!Number.isFinite(newTotal) || newTotal <= 0) return [];

  const resync = await client.query<{ invoice_id: string }>(
    `
      UPDATE accounting.invoice_lines l
         SET unit_amount_cents = $3::bigint,
             line_total_cents  = $3::bigint
        FROM accounting.invoices i
       WHERE l.invoice_id = i.id
         AND i.source_load_id = $1::uuid
         AND i.operating_company_id = $2::uuid
         AND i.status IN ('draft', 'proforma')
         AND i.voided_at IS NULL
         AND l.line_type = 'linehaul'
      RETURNING i.id::text AS invoice_id
    `,
    [input.loadId, input.operatingCompanyId, newTotal]
  );

  const ids: string[] = [];
  for (const row of resync.rows) {
    const id = String(row.invoice_id);
    ids.push(id);
    await recomputeInvoiceTotals(client, id);
  }
  return ids;
}
