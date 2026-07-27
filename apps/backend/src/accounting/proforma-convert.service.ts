/**
 * ND-INV-01 — convert a non-posting proforma invoice to an official draft ready for send/A/R/factoring.
 * Does NOT post GL (reuses existing send/post path). Fail loud if not proforma.
 */
type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export async function convertProformaToOfficial(
  client: Queryable,
  input: { operatingCompanyId: string; loadId: string; userId: string }
): Promise<{ invoiceId: string; converted: boolean; reason?: string }> {
  const existing = await client.query<{ id: string; status: string }>(
    `
      SELECT id::text AS id, status::text AS status
      FROM accounting.invoices
      WHERE operating_company_id = $1::uuid
        AND source_load_id = $2::uuid
        AND voided_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [input.operatingCompanyId, input.loadId]
  );
  const row = existing.rows[0];
  if (!row) {
    return { invoiceId: "", converted: false, reason: "no_invoice_for_load" };
  }
  if (row.status !== "proforma") {
    return { invoiceId: row.id, converted: false, reason: `status_is_${row.status}` };
  }

  await client.query(
    `
      UPDATE accounting.invoices
         SET status = 'draft',
             updated_at = now(),
             updated_by_user_id = $3::uuid
       WHERE id = $1::uuid
         AND operating_company_id = $2::uuid
         AND status = 'proforma'
    `,
    [row.id, input.operatingCompanyId, input.userId]
  );

  return { invoiceId: row.id, converted: true };
}
