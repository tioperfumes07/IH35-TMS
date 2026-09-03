import { EXCLUDE_ARCHIVED_MDATA_CUSTOMERS_ALIAS_SQL } from "./test-seed-archive.js";

type QueryableClient = {
  query: <T = Record<string, unknown>>(sql: string, args?: unknown[]) => Promise<{ rows: T[] }>;
};

export type CustomerAutocompleteRow = {
  id: string;
  qbo_id: string;
  display_name: string;
  customer_code?: string;
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
  const contains = term.length > 0 ? `%${term}%` : "%";
  const folded = term.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const containsFolded = folded.length > 0 ? `%${folded}%` : "%";
  // GO-21/GO-23 A2 remainder: the picker itself surfaces truncation honestly (CappedListNotice),
  // but a 100-row hard clamp against ~2,700 prod customers meant a broad or common search term
  // (e.g. a common surname, or no term at all) could still legitimately exceed the cap with the
  // wanted row past position 100 and no way to reach it short of narrowing the search text
  // further. Raised 100 -> 300, then 300 -> 2000 (A2 TURBO 2026-09-02): 300 still fell short of
  // the WHOLE customer set for an empty search or a broad common prefix -- live largest entity
  // (TRK) carries 1,447 active customers. Rows are lightweight (id/name/email/phone/mc_number);
  // a 2000-row response stays trivial payload and now covers every live entity's full roster.
  const limit = Math.max(1, Math.min(args.limit ?? 25, 2000));
  const activeOnly = args.active_only !== false;

  // ACTIVE PREDICATE (one, everywhere): deactivated_at IS NULL.
  // Same as GET /customers?status=active and the Customers roster tabs.
  // status is credit/ops (active|inactive|credit_hold|blacklist), not liveness.
  // POST /deactivate used to stamp deactivated_at only, leaving the status enum unchanged.

  const res = await client.query<CustomerAutocompleteRow>(
    `
      SELECT
        c.id,
        COALESCE(c.qbo_customer_id, '') AS qbo_id,
        c.customer_name AS display_name,
        COALESCE(c.customer_code, '') AS customer_code,
        c.billing_email AS primary_email,
        c.billing_phone AS primary_phone,
        c.mc_number,
        (c.deactivated_at IS NULL) AS active
      FROM mdata.customers c
      WHERE c.operating_company_id = $1::uuid
        AND ${EXCLUDE_ARCHIVED_MDATA_CUSTOMERS_ALIAS_SQL}
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
          OR translate(
            lower(c.customer_name),
            'áàäâãåéèëêíìïîóòöôõúùüûñçýÿ',
            'aaaaaaeeeeiiiiooooouuuuncyy'
          ) ILIKE $5
          OR translate(
            lower(COALESCE(c.customer_code, '')),
            'áàäâãåéèëêíìïîóòöôõúùüûñçýÿ',
            'aaaaaaeeeeiiiiooooouuuuncyy'
          ) ILIKE $5
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
      LIMIT $6::int
    `,
    [args.operating_company_id, activeOnly, term, contains, containsFolded, limit]
  );

  return res.rows;
}
