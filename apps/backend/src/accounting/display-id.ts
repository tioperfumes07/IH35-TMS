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
            WHEN display_id ~ '^INV-[0-9]{4}-[0-9]{5}$' AND display_id LIKE $2 || '%'
              THEN right(display_id, 5)::int
            ELSE 0
          END
        ),
        0
      ) + 1 AS next_number
      FROM accounting.invoices
      WHERE operating_company_id = $1::uuid
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
      WHERE operating_company_id = $1::uuid
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
      WHERE operating_company_id = $1::uuid
        AND issue_date >= make_date($3, 1, 1)
        AND issue_date < make_date($3 + 1, 1, 1)
    `,
    [operatingCompanyId, prefix, year]
  );
  const nextNumber = Number(res.rows[0]?.next_number ?? 1);
  return `${prefix}${String(nextNumber).padStart(4, "0")}`;
}

/**
 * ACCT-F186 (board card LV-BILL-NO-DISPLAY-ID) — bills were the ONLY money document with no
 * human-readable identifier. Measured on prod with the origin test applied: TMS-native bills
 * 13 of 13 carry display_id NULL, in every entity, while TMS-native invoices carry one 6 of 6 and
 * payments 2 of 2. (The 16,245 QBO clones are excluded from that claim — their NULL is expected
 * state under parallel books, not a gap.) A bill is what you argue about with a vendor, attach to
 * an approval, cite in a dispute and hand an auditor; without this it can only be cited by raw UUID,
 * which is exactly what the app URL falls back to.
 *
 * Deliberately identical in shape to nextInvoiceDisplayId: same advisory lock discipline, same
 * per-entity + per-year scope, same padding width as the invoice/payment series so the documents
 * read alike. display_id is unique PER ENTITY, never globally.
 */
export async function nextBillDisplayId(client: Queryable, operatingCompanyId: string, referenceDate: Date = new Date()) {
  const year = toYear(referenceDate);
  const prefix = `BILL-${year}-`;
  await withDisplayLock(client, `accounting.bill.display_id:${operatingCompanyId}:${year}`);
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
      FROM accounting.bills
      WHERE operating_company_id = $1::uuid
        AND bill_date >= make_date($3, 1, 1)
        AND bill_date < make_date($3 + 1, 1, 1)
    `,
    [operatingCompanyId, prefix, year]
  );
  const nextNumber = Number(res.rows[0]?.next_number ?? 1);
  return `${prefix}${String(nextNumber).padStart(5, "0")}`;
}

export async function nextVendorCreditDisplayId(client: Queryable, operatingCompanyId: string, referenceDate: Date = new Date()) {
  const year = toYear(referenceDate);
  const prefix = `VC-${year}-`;
  await withDisplayLock(client, `accounting.vendor_credit.display_id:${operatingCompanyId}:${year}`);
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
      FROM accounting.vendor_credits
      WHERE operating_company_id = $1::uuid
        AND issue_date >= make_date($3, 1, 1)
        AND issue_date < make_date($3 + 1, 1, 1)
    `,
    [operatingCompanyId, prefix, year]
  );
  const nextNumber = Number(res.rows[0]?.next_number ?? 1);
  return `${prefix}${String(nextNumber).padStart(4, "0")}`;
}

export async function nextFactoringDisplayId(client: Queryable, operatingCompanyId: string, referenceDate: Date = new Date()) {
  const year = toYear(referenceDate);
  const prefix = `FAC-${year}-`;
  await withDisplayLock(client, `accounting.factoring.display_id:${operatingCompanyId}:${year}`);
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
      FROM accounting.factoring_advances
      WHERE operating_company_id = $1::uuid
        AND submitted_at >= make_date($3, 1, 1)
        AND submitted_at < make_date($3 + 1, 1, 1)
    `,
    [operatingCompanyId, prefix, year]
  );
  const nextNumber = Number(res.rows[0]?.next_number ?? 1);
  return `${prefix}${String(nextNumber).padStart(5, "0")}`;
}

/**
 * QBO-style document number for expenses that are not load-attributed.
 * Load-scoped numbers stay `L-<load>-<seq>` via generateExpenseNumber; this series is EXP-YYYY-#####
 * so driverless / WO / Record Expense always have a visible Ref no. the operator can override.
 */
export async function nextExpenseDisplayId(client: Queryable, operatingCompanyId: string, referenceDate: Date = new Date()) {
  const year = toYear(referenceDate);
  const prefix = `EXP-${year}-`;
  await withDisplayLock(client, `accounting.expense.expense_number:${operatingCompanyId}:${year}`);
  const res = await client.query<{ next_number: number }>(
    `
      SELECT COALESCE(
        MAX(
          CASE
            WHEN expense_number ~ ('^' || $2 || '[0-9]+$') THEN right(expense_number, 5)::int
            ELSE 0
          END
        ),
        0
      ) + 1 AS next_number
      FROM accounting.expenses
      WHERE operating_company_id = $1::uuid
        AND transaction_date >= make_date($3, 1, 1)
        AND transaction_date < make_date($3 + 1, 1, 1)
    `,
    [operatingCompanyId, prefix, year]
  );
  const nextNumber = Number(res.rows[0]?.next_number ?? 1);
  return `${prefix}${String(nextNumber).padStart(5, "0")}`;
}
