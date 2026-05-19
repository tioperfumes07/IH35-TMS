type QueryableClient = {
  query: <T = Record<string, unknown>>(sql: string, args?: unknown[]) => Promise<{ rows: T[] }>;
};

export type CustomerAutocompleteRow = {
  id: string;
  qbo_id: string;
  display_name: string;
  primary_email: string | null;
  primary_phone: string | null;
  mc_number: string | null;
  active: boolean;
};

export async function searchCustomersForAutocomplete(
  client: QueryableClient,
  args: {
    operating_company_id: string;
    term: string;
    limit?: number;
    active_only?: boolean;
  }
): Promise<CustomerAutocompleteRow[]> {
  const term = args.term.trim();
  const prefix = term.length > 0 ? `${term}%` : "%";
  const limit = Math.max(1, Math.min(args.limit ?? 25, 100));
  const activeOnly = args.active_only !== false;

  const res = await client.query<CustomerAutocompleteRow>(
    `
      SELECT
        c.id,
        COALESCE(c.qbo_customer_id, '') AS qbo_id,
        c.customer_name AS display_name,
        c.billing_email AS primary_email,
        c.billing_phone AS primary_phone,
        c.mc_number,
        (c.deactivated_at IS NULL) AS active
      FROM mdata.customers c
      WHERE c.operating_company_id = $1::uuid
        AND ($2::boolean = false OR c.deactivated_at IS NULL)
        AND (
          $3::text = ''
          OR (
            length($3::text) >= 3
            AND to_tsvector(
              'english',
              c.customer_name || ' ' || COALESCE(c.customer_code, '') || ' ' || COALESCE(c.mc_number, '') || ' ' || COALESCE(c.billing_email, '')
            ) @@ plainto_tsquery('english', $3::text)
          )
          OR c.customer_name ILIKE $4
          OR COALESCE(c.customer_code, '') ILIKE $4
          OR COALESCE(c.mc_number, '') ILIKE $4
          OR COALESCE(c.billing_email, '') ILIKE $4
        )
      ORDER BY
        CASE
          WHEN lower(c.customer_name) = lower($3::text) THEN 0
          WHEN c.customer_name ILIKE $4 OR COALESCE(c.customer_code, '') ILIKE $4 OR COALESCE(c.mc_number, '') ILIKE $4 OR COALESCE(c.billing_email, '') ILIKE $4 THEN 1
          ELSE 2
        END ASC,
        ts_rank_cd(
          to_tsvector(
            'english',
            c.customer_name || ' ' || COALESCE(c.customer_code, '') || ' ' || COALESCE(c.mc_number, '') || ' ' || COALESCE(c.billing_email, '')
          ),
          plainto_tsquery('english', CASE WHEN length($3::text) >= 3 THEN $3::text ELSE 'zzzunused' END)
        ) DESC NULLS LAST,
        c.customer_name ASC
      LIMIT $5::int
    `,
    [args.operating_company_id, activeOnly, term, prefix, limit]
  );

  return res.rows;
}
