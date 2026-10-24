import type { PoolClient } from "pg";

/**
 * 443.281-B endpoint 6: vendor report.
 * Aggregates bills by vendor with total billed, paid, and outstanding AP.
 * Paged, USMCA-scoped.
 */

export type VendorReportQuery = {
  operatingCompanyId: string;
  from: string;
  to: string;
  vendorId?: string;
  limit: number;
  offset: number;
};

export type VendorReportRow = {
  vendor_id: string;
  vendor_name: string;
  bill_count: number;
  total_billed_cents: number;
  total_paid_cents: number;
  outstanding_ap_cents: number;
};

export type VendorReportTotals = {
  vendor_count: number;
  bill_count: number;
  total_billed_cents: number;
  total_paid_cents: number;
  outstanding_ap_cents: number;
};

export type VendorReportPayload = {
  period: { start: string; end: string };
  pagination: { limit: number; offset: number; total: number };
  totals: VendorReportTotals;
  rows: VendorReportRow[];
};

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function getVendorReport(
  client: PoolClient,
  query: VendorReportQuery
): Promise<VendorReportPayload> {
  const { operatingCompanyId, from, to, limit, offset } = query;

  const values: unknown[] = [operatingCompanyId, from, to];
  const filters: string[] = [
    `b.operating_company_id = $1::uuid`,
    `b.voided_at IS NULL`,
    // status exclusion matches fin20-aging canonical pattern — ties to GL 2000 $126,443.92
    `b.status NOT IN ('void', 'voided', 'draft')`,
    `b.bill_date BETWEEN $2::date AND $3::date`,
  ];

  if (query.vendorId) {
    values.push(query.vendorId);
    filters.push(`b.vendor_id = $${values.length}::text`); // accounting.bills.vendor_id is text
  }

  const limitIdx = values.length + 1;
  const offsetIdx = values.length + 2;
  values.push(limit, offset);

  const res = await client.query(
    `
      SELECT
        b.vendor_id::text AS vendor_id,
        COALESCE(v.vendor_name, 'Unknown') AS vendor_name,
        COUNT(DISTINCT b.id)::int AS bill_count,
        COALESCE(SUM(b.amount_cents), 0)::bigint AS total_billed_cents,
        -- total paid: sum of bill_payments for this vendor's bills in the period
        COALESCE((
          SELECT SUM(bp.amount_cents)
          FROM accounting.bill_payments bp
          JOIN accounting.bills b2 ON b2.id = bp.bill_id
          WHERE b2.vendor_id = b.vendor_id
            AND b2.operating_company_id = $1::uuid
            AND b2.bill_date BETWEEN $2::date AND $3::date
            AND b2.voided_at IS NULL
            AND bp.operating_company_id = $1::uuid
            AND bp.voided_at IS NULL
        ), 0)::bigint AS total_paid_cents,
        -- outstanding AP = each bill's remaining balance (amount_cents - paid_cents; accounting.bills has no paid_at /
        -- total_amount_cents — 443.290: those names raised 42703 and the report 500ed)
        COALESCE(SUM(GREATEST(b.amount_cents - COALESCE(b.paid_cents, 0), 0)), 0)::bigint AS outstanding_ap_cents,
        COUNT(*) OVER () AS _total_count
      FROM accounting.bills b
      LEFT JOIN mdata.vendors v ON v.id::text = b.vendor_id -- 443.290: uuid side cast (bills.vendor_id is text)
        AND v.operating_company_id = $1::uuid
      WHERE ${filters.join("\n        AND ")}
      GROUP BY b.vendor_id, v.vendor_name
      ORDER BY total_billed_cents DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `,
    values
  );

  const total = res.rows.length > 0 ? num((res.rows[0] as Record<string, unknown>)._total_count) : 0;

  const rows: VendorReportRow[] = (res.rows as Array<Record<string, unknown>>).map((row) => ({
    vendor_id: String(row.vendor_id),
    vendor_name: String(row.vendor_name),
    bill_count: num(row.bill_count),
    total_billed_cents: num(row.total_billed_cents),
    total_paid_cents: num(row.total_paid_cents),
    outstanding_ap_cents: num(row.outstanding_ap_cents),
  }));

  const totals: VendorReportTotals = {
    vendor_count: total,
    bill_count: rows.reduce((s, r) => s + r.bill_count, 0),
    total_billed_cents: rows.reduce((s, r) => s + r.total_billed_cents, 0),
    total_paid_cents: rows.reduce((s, r) => s + r.total_paid_cents, 0),
    outstanding_ap_cents: rows.reduce((s, r) => s + r.outstanding_ap_cents, 0),
  };

  return {
    period: { start: from, end: to },
    pagination: { limit, offset, total },
    totals,
    rows,
  };
}
