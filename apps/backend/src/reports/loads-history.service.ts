import type { PoolClient } from "pg";
import { loadServiceTrailerLateralSql, loadServiceTrailerNumberSql } from "../dispatch/load-service.js";
import { loadCostRollupLateral, LOAD_COST_ROLLUP_SELECT } from "../accounting/load-cost-rollup.sql.js";
import { COMPANY_TIME_ZONE } from "../lib/company-business-date.js";
import {
  LOADS_REPORT_SCOPE,
  LOADS_REPORT_SCOPE_LABEL,
  LOADS_REPORT_SCOPE_SQL,
  scheduledStopDateSql,
  effectiveDateField,
  type LoadsReportDateField,
  type LoadsReportRow,
} from "./loads-report.service.js";

/**
 * 443.281-B: paged loads history, reuses the loads-report filter + row shape.
 * Adds: offset pagination, db-side totals, AR-1100 tie-out count.
 */

export type LoadsHistoryQuery = {
  operatingCompanyId: string;
  from: string;
  to: string;
  dateField: LoadsHistoryDateField;
  customerId?: string;
  driverId?: string;
  unitId?: string;
  status?: string;
  tripType?: string;
  factoringStatus?: string;
  limit: number;
  offset: number;
};

export type LoadsHistoryDateField = "pickup" | "delivery";

export type LoadsHistoryTotals = {
  load_count: number;
  revenue_cents: number;
  driver_pay_cents: number;
  fuel_cents: number;
  margin_cents: number;
  /** Count of A/R invoices in accounting.invoices for the filtered load set (ties to GL 1100). */
  ar_invoice_count: number;
  /** Sum of invoice amount_cents for the filtered load set (ties to GL 1100 posted balance). */
  ar_invoice_amount_cents: number;
};

export type LoadsHistoryPayload = {
  date_field: "pickup" | "delivery";
  scope: typeof LOADS_REPORT_SCOPE;
  scope_label: string;
  period: { start: string; end: string };
  pagination: { limit: number; offset: number; total: number };
  totals: LoadsHistoryTotals;
  rows: LoadsReportRow[];
};

function buildFilters(query: LoadsHistoryQuery): { filters: string[]; values: unknown[] } {
  const { operatingCompanyId, from, to, dateField } = query;
  const values: unknown[] = [operatingCompanyId, from, to];
  const filters: string[] = [
    `l.operating_company_id = $1::uuid`,
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

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function nullableNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function getLoadsHistoryPage(
  client: PoolClient,
  query: LoadsHistoryQuery
): Promise<LoadsHistoryPayload> {
  const { operatingCompanyId, from, to, dateField, limit, offset } = query;
  const { filters, values } = buildFilters(query);

  const limitIdx = values.length + 1;
  const offsetIdx = values.length + 2;

  // Main paged SELECT — same CTEs as loads-report, plus COUNT + totals windowed.
  const res = await client.query(
    `
      WITH pickup AS (
        SELECT DISTINCT ON (ls.load_id)
          ls.load_id,
          NULLIF(trim(ls.city), '') AS origin_city,
          NULLIF(trim(ls.state), '') AS origin_state,
          (COALESCE(ls.scheduled_arrival_at, ls.appointment_start_at) AT TIME ZONE '${COMPANY_TIME_ZONE}')::date AS pickup_date
        FROM mdata.load_stops ls
        WHERE ls.stop_type = 'pickup' AND ls.soft_deleted_at IS NULL
        ORDER BY ls.load_id, ls.sequence_number ASC
      ),
      delivery AS (
        SELECT DISTINCT ON (ls.load_id)
          ls.load_id,
          NULLIF(trim(ls.city), '') AS destination_city,
          NULLIF(trim(ls.state), '') AS destination_state,
          (COALESCE(ls.scheduled_arrival_at, ls.appointment_start_at) AT TIME ZONE '${COMPANY_TIME_ZONE}')::date AS delivery_date
        FROM mdata.load_stops ls
        WHERE ls.stop_type = 'delivery' AND ls.soft_deleted_at IS NULL
        ORDER BY ls.load_id, ls.sequence_number DESC
      ),
      invoice_info AS (
        SELECT DISTINCT ON (i.source_load_id)
          i.source_load_id AS load_id,
          i.id::text AS invoice_id,
          i.display_id AS invoice_number,
          i.factoring_advance_id::text AS factoring_advance_id
        FROM accounting.invoices i
        WHERE i.operating_company_id = $1::uuid
          AND i.source_load_id IS NOT NULL
          AND i.status <> 'void'
          AND i.voided_at IS NULL
        ORDER BY i.source_load_id, i.created_at DESC
      ),
      factoring_by_load AS (
        SELECT DISTINCT ON (fa.source_load_id)
          fa.source_load_id AS load_id,
          fa.id::text AS factoring_advance_id,
          COALESCE(fa.display_id, fa.faro_invoice_number) AS factoring_display,
          fa.status::text AS factoring_status
        FROM accounting.factoring_advances fa
        WHERE fa.operating_company_id = $1::uuid
          AND fa.voided_at IS NULL
          AND fa.source_load_id IS NOT NULL
        ORDER BY fa.source_load_id, COALESCE(fa.advanced_at, fa.created_at) DESC
      ),
      factoring_by_id AS (
        SELECT
          fa.id::text AS factoring_advance_id,
          COALESCE(fa.display_id, fa.faro_invoice_number) AS factoring_display,
          fa.status::text AS factoring_status
        FROM accounting.factoring_advances fa
        WHERE fa.operating_company_id = $1::uuid
          AND fa.voided_at IS NULL
      ),
      base AS (
        SELECT
          l.id::text AS load_id,
          l.load_number,
          l.status::text AS status,
          l.trip_type::text AS trip_type,
          l.customer_id::text AS customer_id,
          COALESCE(c.customer_name, mdata.resolve_customer_label_same_company(l.customer_id, $1::uuid)) AS customer_name,
          l.assigned_primary_driver_id::text AS driver_id,
          mdata.resolve_driver_label_same_company(l.assigned_primary_driver_id, l.operating_company_id) AS driver_name,
          l.assigned_unit_id::text AS unit_id,
          u.unit_number,
          CASE WHEN l.trailer_source IN ('customer', 'none') THEN NULL ELSE tr.id::text END AS trailer_id,
          ${loadServiceTrailerNumberSql("l", "tr")} AS trailer_number,
          l.customer_po_number,
          l.customer_wo_number,
          p.origin_city,
          p.origin_state,
          d.destination_city,
          d.destination_state,
          p.pickup_date::text AS pickup_date,
          d.delivery_date::text AS delivery_date,
          l.miles_practical::text AS miles_practical,
          l.miles_shortest::text AS miles_shortest,
          l.miles_driven_actual::text AS miles_driven_actual,
          inv.invoice_id,
          inv.invoice_number,
          COALESCE(fbl.factoring_advance_id, inv.factoring_advance_id) AS factoring_advance_id,
          COALESCE(fbl.factoring_display, fbi.factoring_display) AS factoring_display,
          COALESCE(fbl.factoring_status, fbi.factoring_status) AS factoring_status,
          ${LOAD_COST_ROLLUP_SELECT},
          COUNT(*) OVER () AS _total_count
        FROM mdata.loads l
        LEFT JOIN mdata.customers c ON c.id = l.customer_id AND c.operating_company_id = $1::uuid
        LEFT JOIN mdata.units u ON u.id = l.assigned_unit_id
        ${loadServiceTrailerLateralSql("l", "tr")}
        LEFT JOIN pickup p ON p.load_id = l.id
        LEFT JOIN delivery d ON d.load_id = l.id
        LEFT JOIN invoice_info inv ON inv.load_id = l.id
        LEFT JOIN factoring_by_load fbl ON fbl.load_id = l.id
        LEFT JOIN factoring_by_id fbi ON fbi.factoring_advance_id = inv.factoring_advance_id
        ${loadCostRollupLateral("l.id", "$1::uuid")}
        WHERE ${filters.join("\n          AND ")}
        ORDER BY l.load_number DESC NULLS LAST, l.created_at DESC
      )
      SELECT * FROM base
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `,
    [...values, limit, offset]
  );

  const total = num(res.rows[0]?._total_count ?? 0);

  const rows: LoadsReportRow[] = (res.rows as Array<Record<string, string | null>>).map((row) => ({
    load_id: String(row.load_id),
    load_number: row.load_number,
    status: row.status,
    trip_type: row.trip_type,
    customer_id: row.customer_id,
    customer_name: row.customer_name,
    driver_id: row.driver_id,
    driver_name: row.driver_name,
    unit_id: row.unit_id,
    unit_number: row.lc_unit_number ?? row.unit_number,
    trailer_id: row.trailer_id,
    trailer_number: row.trailer_number,
    customer_po_number: row.customer_po_number,
    customer_wo_number: row.customer_wo_number,
    origin_city: row.origin_city,
    origin_state: row.origin_state,
    destination_city: row.destination_city,
    destination_state: row.destination_state,
    pickup_date: row.pickup_date,
    delivery_date: row.delivery_date,
    miles_practical: nullableNum(row.miles_practical),
    miles_shortest: nullableNum(row.miles_shortest),
    miles_driven_actual: nullableNum(row.miles_driven_actual),
    revenue_cents: num(row.lc_revenue_cents),
    driver_pay_cents: num(row.lc_driver_pay_cents),
    fuel_cents: num(row.lc_fuel_cents),
    margin_cents: num(row.lc_margin_cents),
    invoice_id: row.invoice_id,
    invoice_number: row.invoice_number,
    factoring_advance_id: row.factoring_advance_id,
    factoring_display: row.factoring_display,
    factoring_status: row.factoring_status,
    settlement_number: row.lc_settlement_number,
    settlement_id: row.lc_settlement_id ?? null,
  }));

  // DB-side totals for the full filtered set (not just this page).
  // AR 1100 tie-out: accounting.invoices posted for loads in this date/filter window.
  const { totalsFilters, totalsValues } = buildTotalsFilters(query);
  const totalsRes = await client.query(
    `
      SELECT
        COUNT(DISTINCT l.id)::int AS load_count,
        COALESCE(SUM(lc.lc_revenue_cents), 0)::bigint AS revenue_cents,
        COALESCE(SUM(lc.lc_driver_pay_cents), 0)::bigint AS driver_pay_cents,
        COALESCE(SUM(lc.lc_fuel_cents), 0)::bigint AS fuel_cents,
        COALESCE(SUM(lc.lc_margin_cents), 0)::bigint AS margin_cents,
        COUNT(DISTINCT inv.id)::int AS ar_invoice_count,
        COALESCE(SUM(inv.amount_cents), 0)::bigint AS ar_invoice_amount_cents
      FROM mdata.loads l
      ${loadCostRollupLateral("l.id", "$1::uuid")}
      LEFT JOIN accounting.invoices inv
        ON inv.source_load_id = l.id
        AND inv.operating_company_id = $1::uuid
        AND inv.status <> 'void'
        AND inv.voided_at IS NULL
      WHERE ${totalsFilters.join("\n        AND ")}
    `,
    totalsValues
  );

  const t = totalsRes.rows[0] as Record<string, unknown>;
  const totals: LoadsHistoryTotals = {
    load_count: num(t.load_count),
    revenue_cents: num(t.revenue_cents),
    driver_pay_cents: num(t.driver_pay_cents),
    fuel_cents: num(t.fuel_cents),
    margin_cents: num(t.margin_cents),
    ar_invoice_count: num(t.ar_invoice_count),
    ar_invoice_amount_cents: num(t.ar_invoice_amount_cents),
  };

  return {
    date_field: effectiveDateField(dateField as LoadsReportDateField),
    scope: LOADS_REPORT_SCOPE,
    scope_label: LOADS_REPORT_SCOPE_LABEL,
    period: { start: from, end: to },
    pagination: { limit, offset, total },
    totals,
    rows,
  };
}

function buildTotalsFilters(query: LoadsHistoryQuery): {
  totalsFilters: string[];
  totalsValues: unknown[];
} {
  const { filters, values } = buildFilters(query);
  return { totalsFilters: filters, totalsValues: values };
}
