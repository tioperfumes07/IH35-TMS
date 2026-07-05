type Queryable = {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
};

/**
 * H6-2: serialize concurrent CA-number generation. Without this, two concurrent
 * createDriverCashAdvanceCore transactions both run MAX(display_id)+1 against the same
 * (operating_company_id, year) window and mint the SAME number → duplicate cash-advance
 * numbers. Reuses the exact advisory-lock pattern already used by accounting/display-id.ts
 * (nextInvoiceDisplayId et al.). pg_advisory_xact_lock is held for the rest of the
 * transaction, so the read-and-INSERT that follows is serialized per (company, year).
 * Must be called inside the same transaction that performs the INSERT.
 */
async function withDisplayLock(client: Queryable, scope: string) {
  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [scope]);
}

export async function nextCashAdvanceDisplayId(
  client: Queryable,
  operatingCompanyId: string,
  referenceDate: Date = new Date()
) {
  const year = referenceDate.getUTCFullYear();
  const prefix = `CA-${year}-`;
  await withDisplayLock(client, `driver_finance.cash_advance.display_id:${operatingCompanyId}:${year}`);
  const rows = await client.query(
    `
      SELECT COALESCE(
        MAX(
          CASE
            WHEN display_id LIKE $2 || '%' THEN right(display_id, 4)::int
            ELSE 0
          END
        ),
        0
      ) + 1 AS next_number
      FROM driver_finance.driver_advances
      WHERE operating_company_id = $1
        AND created_at >= make_date($3, 1, 1)
        AND created_at < make_date($3 + 1, 1, 1)
    `,
    [operatingCompanyId, prefix, year]
  );
  const nextNumber = Number(rows.rows[0]?.next_number ?? 1);
  const serial = String(nextNumber).padStart(4, "0");
  return `${prefix}${serial}`;
}
