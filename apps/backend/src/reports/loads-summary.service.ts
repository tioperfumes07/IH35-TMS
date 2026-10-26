import type { PoolClient } from "pg";
import { loadCostRollupLateral } from "../accounting/load-cost-rollup.sql.js";
import {
  LOADS_REPORT_SCOPE_SQL,
  scheduledStopDateSql,
  effectiveDateField,
  type LoadsReportDateField,
} from "./loads-report.service.js";

/**
 * 443.281-B endpoint 2: group-by aggregation over the same loads filter.
 * Returns totals per dimension (customer | driver | unit | trip_type | month)
 * plus a grand-total row. Used by the Load Summary board in Cursor.
 */

export type LoadsSummaryGroupBy = "customer" | "driver" | "unit" | "trip_type" | "month";

export type LoadsSummaryQuery = {
  operatingCompanyId: string;
  from: string;
  to: string;
  dateField: "pickup" | "delivery";
  groupBy: LoadsSummaryGroupBy;
  customerId?: string;
  driverId?: string;
  unitId?: string;
  status?: string;
  tripType?: string;
  factoringStatus?: string;
};

export type LoadsSummaryRow = {
  group_key: string;
  group_label: string;
  load_count: number;
  revenue_cents: number;
  driver_pay_cents: number;
  fuel_cents: number;
  margin_cents: number;
  margin_pct: number | null;
};

export type LoadsSummaryPayload = {
  date_field: "pickup" | "delivery";
  group_by: LoadsSummaryGroupBy;
  period: { start: string; end: string };
  totals: {
    load_count: number;
    revenue_cents: number;
    driver_pay_cents: number;
    fuel_cents: number;
    margin_cents: number;
  };
  rows: LoadsSummaryRow[];
};

function buildFilters(query: LoadsSummaryQuery): { filters: string[]; values: unknown[] } {
  const { operatingCompanyId, from, to, dateField } = query;
  const values: unknown[] = [operatingCompanyId, from, to];
  const filters: string[] = [
    ...LOADS_REPORT_SCOPE_SQL,
    `${scheduledStopDateSql(effectiveDateField(dateField as LoadsReportDateField))} BETWEEN $2::date AND $3::date`,
  ];

  if (query.customerId) {
    values.push(query.customerId);
    filters.push(`l.customer_id = $${values.length}::uuid`);
  }
  if (query.driverId) {
    values.push(query.driverId);
    filters.push(
      `(l.assigned_primary_driver_id = $${values.length}::uuid OR l.assigned_secondary_driver_id = $${values.length}::uuid)`
    );
  }
  if (query.unitId) {
    values.push(query.unitId);
    filters.push(`l.assigned_unit_id = $${values.length}::uuid`);
  }
  if (query.status) {
    values.push(query.status);
    filters.push(`l.status = $${values.length}`);
  }
  if (query.tripType) {
    values.push(query.tripType);
    filters.push(`l.trip_type = $${values.length}`);
  }
  if (query.factoringStatus) {
    values.push(query.factoringStatus);
    filters.push(`EXISTS (
      SELECT 1 FROM accounting.factoring_advances fa2
      WHERE fa2.source_load_id = l.id
        AND fa2.operating_company_id = $1::uuid
        AND fa2.voided_at IS NULL
        AND fa2.status::text = $${values.length}
    )`);
  }

  return { filters, values };
}

function groupByExprs(groupBy: LoadsSummaryGroupBy): { keyExpr: string; labelExpr: string; orderExpr: string } {
  switch (groupBy) {
    case "customer":
      return {
        keyExpr: `COALESCE(l.customer_id::text, 'none')`,
        labelExpr: `COALESCE(c.customer_name, mdata.resolve_customer_label_same_company(l.customer_id, $1::uuid), 'Unknown')`,
        orderExpr: `2 ASC`,
      };
    case "driver":
      return {
        keyExpr: `COALESCE(l.assigned_primary_driver_id::text, 'none')`,
        labelExpr: `COALESCE(mdata.resolve_driver_label_same_company(l.assigned_primary_driver_id, l.operating_company_id), 'Unassigned')`,
        orderExpr: `2 ASC`,
      };
    case "unit":
      return {
        keyExpr: `COALESCE(l.assigned_unit_id::text, 'none')`,
        labelExpr: `COALESCE(u.unit_number, 'Unassigned')`,
        orderExpr: `2 ASC`,
      };
    case "trip_type":
      return {
        keyExpr: `COALESCE(l.trip_type::text, 'Other')`,
        labelExpr: `COALESCE(l.trip_type::text, 'Other')`,
        orderExpr: `2 ASC`,
      };
    case "month":
      return {
        keyExpr: `to_char(${scheduledStopDateSql("pickup")}, 'YYYY-MM')`,
        labelExpr: `to_char(${scheduledStopDateSql("pickup")}, 'YYYY-MM')`,
        orderExpr: `1 ASC`,
      };
  }
}

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function getLoadsSummary(
  client: PoolClient,
  query: LoadsSummaryQuery
): Promise<LoadsSummaryPayload> {
  const { operatingCompanyId, from, to, dateField, groupBy } = query;
  const { filters, values } = buildFilters(query);
  const { keyExpr, labelExpr, orderExpr } = groupByExprs(groupBy);

  const res = await client.query(
    `
      SELECT
        ${keyExpr} AS group_key,
        ${labelExpr} AS group_label,
        COUNT(DISTINCT l.id)::int AS load_count,
        COALESCE(SUM(lcr.revenue_cents), 0)::bigint AS revenue_cents,
        COALESCE(SUM(lcr.driver_pay_cents), 0)::bigint AS driver_pay_cents,
        COALESCE(SUM(lcr.fuel_cents), 0)::bigint AS fuel_cents,
        COALESCE(SUM(lcr.margin_cents), 0)::bigint AS margin_cents
      FROM mdata.loads l
      LEFT JOIN mdata.customers c ON c.id = l.customer_id AND c.operating_company_id = $1::uuid
      LEFT JOIN mdata.units u ON u.id = l.assigned_unit_id
        AND (u.owner_company_id = l.operating_company_id OR u.currently_leased_to_company_id = l.operating_company_id)
      ${loadCostRollupLateral("l.id", "$1::uuid")}
      WHERE l.operating_company_id = $1::uuid
        AND ${filters.join("\n        AND ")}
      GROUP BY ${keyExpr}, ${labelExpr}
      ORDER BY ${orderExpr}
    `,
    values
  );

  const rows: LoadsSummaryRow[] = (res.rows as Array<Record<string, unknown>>).map((row) => {
    const rev = num(row.revenue_cents);
    return {
      group_key: String(row.group_key ?? ""),
      group_label: String(row.group_label ?? ""),
      load_count: num(row.load_count),
      revenue_cents: rev,
      driver_pay_cents: num(row.driver_pay_cents),
      fuel_cents: num(row.fuel_cents),
      margin_cents: num(row.margin_cents),
      margin_pct: rev > 0 ? Math.round((num(row.margin_cents) / rev) * 10000) / 100 : null,
    };
  });

  const totals = {
    load_count: rows.reduce((s, r) => s + r.load_count, 0),
    revenue_cents: rows.reduce((s, r) => s + r.revenue_cents, 0),
    driver_pay_cents: rows.reduce((s, r) => s + r.driver_pay_cents, 0),
    fuel_cents: rows.reduce((s, r) => s + r.fuel_cents, 0),
    margin_cents: rows.reduce((s, r) => s + r.margin_cents, 0),
  };

  return {
    date_field: effectiveDateField(dateField as LoadsReportDateField),
    group_by: groupBy,
    period: { start: from, end: to },
    totals,
    rows,
  };
}
