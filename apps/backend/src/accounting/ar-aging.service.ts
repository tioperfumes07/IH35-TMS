import { withCurrentUser } from "../auth/db.js";

type ArAgingInvoiceRowDb = {
  customer_id: string;
  customer_name: string;
  due_date: string;
  amount_open_cents: string | number;
};

export type ArAgingCustomerRow = {
  customer_id: string;
  customer_name: string;
  current: number;
  d1_30: number;
  d31_60: number;
  d61_90: number;
  d90_plus: number;
  total_outstanding: number;
};

export type ArAgingTotals = {
  current: number;
  d1_30: number;
  d31_60: number;
  d61_90: number;
  d90_plus: number;
  total_outstanding: number;
};

export type ArAgingReport = {
  customers: ArAgingCustomerRow[];
  totals: ArAgingTotals;
};

function parseIsoDateOnly(value: string): number {
  return new Date(`${value}T00:00:00.000Z`).getTime();
}

export async function getArAgingReport(input: {
  userId: string;
  operating_company_id: string;
  as_of_date: string;
}): Promise<ArAgingReport> {
  return withCurrentUser(input.userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);

    const res = await client.query<ArAgingInvoiceRowDb>(
      `
        SELECT
          i.customer_id::text AS customer_id,
          COALESCE(c.customer_name, '') AS customer_name,
          i.due_date::text AS due_date,
          i.amount_open_cents::bigint AS amount_open_cents
        FROM accounting.invoices i
        LEFT JOIN mdata.customers c
          ON c.id = i.customer_id
        WHERE i.operating_company_id = $1::uuid
          AND i.amount_open_cents IS NOT NULL
          AND i.amount_open_cents > 0
          AND i.voided_at IS NULL
          AND i.status NOT IN ('paid', 'voided', 'draft')
        ORDER BY c.customer_name ASC, i.due_date ASC
      `,
      [input.operating_company_id]
    );

    const asOfTime = parseIsoDateOnly(input.as_of_date);
    const byCustomer = new Map<string, ArAgingCustomerRow>();

    for (const row of res.rows) {
      const amount = Number(row.amount_open_cents ?? 0);
      if (amount <= 0) continue;

      const dueTime = parseIsoDateOnly(row.due_date);
      const daysOverdue = Math.floor((asOfTime - dueTime) / 86_400_000);

      const key = row.customer_id;
      const customer = byCustomer.get(key) ?? {
        customer_id: row.customer_id,
        customer_name: row.customer_name,
        current: 0,
        d1_30: 0,
        d31_60: 0,
        d61_90: 0,
        d90_plus: 0,
        total_outstanding: 0,
      };

      if (daysOverdue <= 0) {
        customer.current += amount;
      } else if (daysOverdue <= 30) {
        customer.d1_30 += amount;
      } else if (daysOverdue <= 60) {
        customer.d31_60 += amount;
      } else if (daysOverdue <= 90) {
        customer.d61_90 += amount;
      } else {
        customer.d90_plus += amount;
      }

      customer.total_outstanding =
        customer.current + customer.d1_30 + customer.d31_60 + customer.d61_90 + customer.d90_plus;
      byCustomer.set(key, customer);
    }

    const customers = Array.from(byCustomer.values()).sort(
      (a, b) => a.customer_name.localeCompare(b.customer_name) || a.customer_id.localeCompare(b.customer_id)
    );

    const totals: ArAgingTotals = customers.reduce(
      (acc, row) => {
        acc.current += row.current;
        acc.d1_30 += row.d1_30;
        acc.d31_60 += row.d31_60;
        acc.d61_90 += row.d61_90;
        acc.d90_plus += row.d90_plus;
        acc.total_outstanding += row.total_outstanding;
        return acc;
      },
      {
        current: 0,
        d1_30: 0,
        d31_60: 0,
        d61_90: 0,
        d90_plus: 0,
        total_outstanding: 0,
      }
    );

    return { customers, totals };
  });
}
