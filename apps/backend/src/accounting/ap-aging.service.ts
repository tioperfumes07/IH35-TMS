import { withCurrentUser } from "../auth/db.js";

type ApAgingBillRowDb = {
  vendor_id: string | null;
  vendor_name: string;
  due_date: string | null;
  outstanding_cents: string | number;
};

export type ApAgingVendorRow = {
  vendor_id: string | null;
  vendor_name: string;
  current: number;
  d1_30: number;
  d31_60: number;
  d61_90: number;
  d90_plus: number;
  total_outstanding: number;
};

export type ApAgingTotals = {
  current: number;
  d1_30: number;
  d31_60: number;
  d61_90: number;
  d90_plus: number;
  total_outstanding: number;
};

export type ApAgingReport = {
  vendors: ApAgingVendorRow[];
  totals: ApAgingTotals;
};

function parseIsoDateOnly(value: string): number {
  return new Date(`${value}T00:00:00.000Z`).getTime();
}

export async function getApAgingReport(input: {
  userId: string;
  operating_company_id: string;
  as_of_date: string;
}): Promise<ApAgingReport> {
  return withCurrentUser(input.userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);

    const res = await client.query<ApAgingBillRowDb>(
      `
        SELECT
          v.id::text AS vendor_id,
          COALESCE(v.vendor_name, 'Unknown Vendor') AS vendor_name,
          b.due_date::text AS due_date,
          (b.amount_cents - b.paid_cents)::bigint AS outstanding_cents
        FROM accounting.bills b
        LEFT JOIN mdata.vendors v
          ON v.id = CASE
            WHEN b.vendor_uuid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            THEN b.vendor_uuid::uuid
            ELSE NULL
          END
        WHERE b.operating_company_id = $1::uuid
          AND b.amount_cents IS NOT NULL
          AND (b.amount_cents - b.paid_cents) > 0
          AND b.revoked_at IS NULL
          AND b.status NOT IN ('paid', 'voided', 'draft')
        ORDER BY COALESCE(v.vendor_name, 'Unknown Vendor') ASC, b.due_date ASC NULLS LAST
      `,
      [input.operating_company_id]
    );

    const asOfTime = parseIsoDateOnly(input.as_of_date);
    const byVendor = new Map<string, ApAgingVendorRow>();

    for (const row of res.rows) {
      const amount = Number(row.outstanding_cents ?? 0);
      if (amount <= 0) continue;

      const key = row.vendor_id ?? "__unknown_vendor__";
      const vendor = byVendor.get(key) ?? {
        vendor_id: row.vendor_id,
        vendor_name: row.vendor_name,
        current: 0,
        d1_30: 0,
        d31_60: 0,
        d61_90: 0,
        d90_plus: 0,
        total_outstanding: 0,
      };

      if (!row.due_date) {
        vendor.current += amount;
      } else {
        const dueTime = parseIsoDateOnly(row.due_date);
        const daysOverdue = Math.floor((asOfTime - dueTime) / 86_400_000);

        if (daysOverdue <= 0) {
          vendor.current += amount;
        } else if (daysOverdue <= 30) {
          vendor.d1_30 += amount;
        } else if (daysOverdue <= 60) {
          vendor.d31_60 += amount;
        } else if (daysOverdue <= 90) {
          vendor.d61_90 += amount;
        } else {
          vendor.d90_plus += amount;
        }
      }

      vendor.total_outstanding = vendor.current + vendor.d1_30 + vendor.d31_60 + vendor.d61_90 + vendor.d90_plus;
      byVendor.set(key, vendor);
    }

    const vendors = Array.from(byVendor.values()).sort(
      (a, b) => a.vendor_name.localeCompare(b.vendor_name) || (a.vendor_id ?? "").localeCompare(b.vendor_id ?? "")
    );

    const totals: ApAgingTotals = vendors.reduce(
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

    return { vendors, totals };
  });
}
