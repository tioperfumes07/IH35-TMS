type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

async function withDisplayLock(client: Queryable, scope: string) {
  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [scope]);
}

function toYear(referenceDate: Date) {
  return referenceDate.getUTCFullYear();
}

export async function nextInvoiceDisplayId(client: Queryable, operatingCompanyId: string, referenceDate: Date = new Date()) {
  const year = toYear(referenceDate);
  const prefix = `INV-${year}-`;
  await withDisplayLock(client, `accounting.invoice.display_id:${operatingCompanyId}:${year}`);
  const res = await client.query<{ next_number: number }>(
    `
      SELECT COALESCE(
        MAX(
          CASE
            WHEN display_id LIKE $2 || '%' THEN right(display_id, 5)::int
            ELSE 0
          END
        ),
        0
      ) + 1 AS next_number
      FROM accounting.invoices
      WHERE operating_company_id = $1
        AND issue_date >= make_date($3, 1, 1)
        AND issue_date < make_date($3 + 1, 1, 1)
    `,
    [operatingCompanyId, prefix, year]
  );
  const nextNumber = Number(res.rows[0]?.next_number ?? 1);
  return `${prefix}${String(nextNumber).padStart(5, "0")}`;
}

export async function nextPaymentDisplayId(client: Queryable, operatingCompanyId: string, referenceDate: Date = new Date()) {
  const year = toYear(referenceDate);
  const prefix = `PMT-${year}-`;
  await withDisplayLock(client, `accounting.payment.display_id:${operatingCompanyId}:${year}`);
  const res = await client.query<{ next_number: number }>(
    `
      SELECT COALESCE(
        MAX(
          CASE
            WHEN display_id LIKE $2 || '%' THEN right(display_id, 5)::int
            ELSE 0
          END
        ),
        0
      ) + 1 AS next_number
      FROM accounting.payments
      WHERE operating_company_id = $1
        AND payment_date >= make_date($3, 1, 1)
        AND payment_date < make_date($3 + 1, 1, 1)
    `,
    [operatingCompanyId, prefix, year]
  );
  const nextNumber = Number(res.rows[0]?.next_number ?? 1);
  return `${prefix}${String(nextNumber).padStart(5, "0")}`;
}

export async function nextCreditMemoDisplayId(client: Queryable, operatingCompanyId: string, referenceDate: Date = new Date()) {
  const year = toYear(referenceDate);
  const prefix = `CM-${year}-`;
  await withDisplayLock(client, `accounting.credit_memo.display_id:${operatingCompanyId}:${year}`);
  const res = await client.query<{ next_number: number }>(
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
      FROM accounting.credit_memos
      WHERE operating_company_id = $1
        AND issue_date >= make_date($3, 1, 1)
        AND issue_date < make_date($3 + 1, 1, 1)
    `,
    [operatingCompanyId, prefix, year]
  );
  const nextNumber = Number(res.rows[0]?.next_number ?? 1);
  return `${prefix}${String(nextNumber).padStart(4, "0")}`;
}
