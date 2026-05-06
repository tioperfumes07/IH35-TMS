type Queryable = {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
};

export async function nextCashAdvanceDisplayId(
  client: Queryable,
  operatingCompanyId: string,
  referenceDate: Date = new Date()
) {
  const year = referenceDate.getUTCFullYear();
  const prefix = `CA-${year}-`;
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
