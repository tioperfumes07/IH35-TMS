import type { PoolClient } from "pg";
import { loadCostRollupLateral } from "../accounting/load-cost-rollup.sql.js";
import {
  LOADS_REPORT_SCOPE_SQL,
  scheduledStopDateSql,
  effectiveDateField,
  type LoadsReportDateField,
} from "./loads-report.service.js";

/**
 * 443.281-B endpoint 5: customer report.
 * Aggregates loads by customer with revenue, driver pay, fuel, margin, load count,
 * invoice count, and outstanding AR. Paged, USMCA-scoped.
 */

export type CustomerReportQuery = {
  operatingCompanyId: string;
  from: string;
  to: string;
  dateField: "pickup" | "delivery";
  customerId?: string;
  limit: number;
  offset: number;
};

export type CustomerReportRow = {
  customer_id: string;
  customer_name: string;
  load_count: number;
  revenue_cents: number;
  driver_pay_cents: number;
  fuel_cents: number;
  margin_cents: number;
  margin_pct: number | null;
  invoice_count: number;
  outstanding_ar_cents: number;
};

export type CustomerReportTotals = {
  customer_count: number;
  load_count: number;
  revenue_cents: number;
  driver_pay_cents: number;
  margin_cents: number;
  outstanding_ar_cents: number;
};

export type CustomerReportPayload = {
  date_field: "pickup" | "delivery";
  period: { start: string; end: string };
  pagination: { limit: number; offset: number; total: number };
  totals: CustomerReportTotals;
  rows: CustomerReportRow[];
};

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function getCustomerReport(
  client: PoolClient,
  query: CustomerReportQuery
): Promise<CustomerReportPayload> {
  const { operatingCompanyId, from, to, dateField, limit, offset } = query;

  const values: unknown[] = [operatingCompanyId, from, to];
  const filters: string[] = [
    ...LOADS_REPORT_SCOPE_SQL,
    `${scheduledStopDateSql(effectiveDateField(dateField as LoadsReportDateField))} BETWEEN $2::date AND $3::date`,
  ];

  if (query.customerId) {
    values.push(query.customerId);
    filters.push(`l.customer_id = $${values.length}::uuid`);
  }

  const limitIdx = values.length + 1;
  const offsetIdx = values.length + 2;
  values.push(limit, offset);

  const res = await client.query(
    `
      SELECT
        COALESCE(l.customer_id::text, 'none') AS customer_id,
        COALESCE(c.customer_name, 'Unknown') AS customer_name,
        COUNT(DISTINCT l.id)::int AS load_count,
        COALESCE(SUM(lcr.revenue_cents), 0)::bigint AS revenue_cents,
        COALESCE(SUM(lcr.driver_pay_cents), 0)::bigint AS driver_pay_cents,
        COALESCE(SUM(lcr.fuel_cents), 0)::bigint AS fuel_cents,
        COALESCE(SUM(lcr.margin_cents), 0)::bigint AS margin_cents,
        -- invoice count for the load set (issued only — proforma/draft/void excluded)
        COUNT(DISTINCT inv.id)::int AS invoice_count,
        -- outstanding AR = issued invoices not yet paid; proforma/void/draft/factored excluded
        -- to match GL 1100 ($621,076.72 per 443.286 tie-out)
        COALESCE(SUM(
          CASE WHEN inv.id IS NOT NULL AND inv.voided_at IS NULL
            AND COALESCE(inv.amount_open_cents, 0) > 0
            AND inv.status NOT IN ('void', 'voided', 'draft', 'proforma', 'factored')
            THEN COALESCE(inv.amount_open_cents, 0)
          ELSE 0 END
        ), 0)::bigint AS outstanding_ar_cents,
        COUNT(*) OVER () AS _total_count
      FROM mdata.loads l
      LEFT JOIN mdata.customers c ON c.id = l.customer_id AND c.operating_company_id = $1::uuid
      LEFT JOIN accounting.invoices inv ON inv.source_load_id = l.id
        AND inv.operating_company_id = $1::uuid
        AND inv.voided_at IS NULL
        AND inv.status NOT IN ('void', 'voided', 'draft', 'proforma', 'factored')
      ${loadCostRollupLateral("l.id", "$1::uuid")}
      WHERE l.operating_company_id = $1::uuid
        AND ${filters.join("\n        AND ")}
      GROUP BY l.customer_id, c.customer_name
      ORDER BY revenue_cents DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `,
    values
  );

  const total = res.rows.length > 0 ? num((res.rows[0] as Record<string, unknown>)._total_count) : 0;

  const rows: CustomerReportRow[] = (res.rows as Array<Record<string, unknown>>).map((row) => {
    const rev = num(row.revenue_cents);
    return {
      customer_id: String(row.customer_id),
      customer_name: String(row.customer_name),
      load_count: num(row.load_count),
      revenue_cents: rev,
      driver_pay_cents: num(row.driver_pay_cents),
      fuel_cents: num(row.fuel_cents),
      margin_cents: num(row.margin_cents),
      margin_pct: rev > 0 ? Math.round((num(row.margin_cents) / rev) * 10000) / 100 : null,
      invoice_count: num(row.invoice_count),
      outstanding_ar_cents: num(row.outstanding_ar_cents),
    };
  });

  const totals: CustomerReportTotals = {
    customer_count: total,
    load_count: rows.reduce((s, r) => s + r.load_count, 0),
    revenue_cents: rows.reduce((s, r) => s + r.revenue_cents, 0),
    driver_pay_cents: rows.reduce((s, r) => s + r.driver_pay_cents, 0),
    margin_cents: rows.reduce((s, r) => s + r.margin_cents, 0),
    outstanding_ar_cents: rows.reduce((s, r) => s + r.outstanding_ar_cents, 0),
  };

  return {
    date_field: effectiveDateField(dateField as LoadsReportDateField),
    period: { start: from, end: to },
    pagination: { limit, offset, total },
    totals,
    rows,
  };
}
