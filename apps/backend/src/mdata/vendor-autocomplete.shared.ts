// Vendor autocomplete over the CANONICAL master table (mdata.vendors), mirroring
// searchCustomersForAutocomplete. The QBO picker (QboCombobox) previously read the
// accounting.qbo_vendors (canonical; was mdata mirror), but the drawer writers (#2273) write mdata.vendors — so a
// newly-created vendor was invisible in every transaction-editor picker ("create → disappears").
// Reading the real table here (and carrying qbo_vendor_id so QBO linkage survives on select)
// closes that read/write split. Non-financial: a read/list path, no posting.
type QueryableClient = {
  query: <T = Record<string, unknown>>(sql: string, args?: unknown[]) => Promise<{ rows: T[] }>;
};

export type VendorAutocompleteRow = {
  id: string;
  qbo_id: string;
  display_name: string;
  company_name: string | null;
  primary_email: string | null;
  primary_phone: string | null;
  mc_number: string | null;
  active: boolean;
};

export async function searchVendorsForAutocomplete(
  client: QueryableClient,
  args: {
    operating_company_id: string;
    term: string;
    limit?: number;
    active_only?: boolean;
  }
): Promise<VendorAutocompleteRow[]> {
  const term = args.term.trim();
  const like = term.length > 0 ? `%${term}%` : "%";
  const limit = Math.max(1, Math.min(args.limit ?? 25, 100));
  const activeOnly = args.active_only !== false;

  const res = await client.query<VendorAutocompleteRow>(
    `
      SELECT
        v.id,
        COALESCE(v.qbo_vendor_id, '') AS qbo_id,
        v.vendor_name AS display_name,
        v.vendor_name AS company_name,
        v.email AS primary_email,
        v.phone AS primary_phone,
        v.mc_number,
        (v.deactivated_at IS NULL) AS active
      FROM mdata.vendors v
      WHERE v.operating_company_id = $1::uuid
        AND ($2::boolean = false OR v.deactivated_at IS NULL)
        AND (
          $3::text = ''
          OR v.vendor_name ILIKE $4
          OR COALESCE(v.vendor_code, '') ILIKE $4
          OR COALESCE(v.email, '') ILIKE $4
          OR COALESCE(v.mc_number, '') ILIKE $4
        )
      ORDER BY
        CASE WHEN lower(v.vendor_name) = lower($3::text) THEN 0
             WHEN v.vendor_name ILIKE $4 THEN 1
             ELSE 2 END ASC,
        v.vendor_name ASC
      LIMIT $5
    `,
    [args.operating_company_id, activeOnly, term, like, limit]
  );
  return res.rows;
}
