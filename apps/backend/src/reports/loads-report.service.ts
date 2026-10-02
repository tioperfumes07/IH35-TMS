import type { PoolClient } from "pg";
import { loadCostRollupLateral, LOAD_COST_ROLLUP_SELECT } from "../accounting/load-cost-rollup.sql.js";

export type LoadsReportDateField = "created" | "pickup" | "delivery";

export type LoadsReportRow = {
  load_id: string;
  load_number: string | null;
  status: string | null;
  trip_type: string | null;
  customer_id: string | null;
  customer_name: string | null;
  driver_id: string | null;
  driver_name: string | null;
  unit_id: string | null;
  unit_number: string | null;
  trailer_id: string | null;
  trailer_number: string | null;
  customer_po_number: string | null;
  customer_wo_number: string | null;
  origin_city: string | null;
  origin_state: string | null;
  destination_city: string | null;
  destination_state: string | null;
  pickup_date: string | null;
  delivery_date: string | null;
  miles_practical: number | null;
  miles_shortest: number | null;
  miles_driven_actual: number | null;
  revenue_cents: number;
  driver_pay_cents: number;
  fuel_cents: number;
  margin_cents: number;
  invoice_id: string | null;
  invoice_number: string | null;
  factoring_advance_id: string | null;
  factoring_display: string | null;
  factoring_status: string | null;
  settlement_number: string | null;
  settlement_id: string | null;
};

export type LoadsReportTotals = {
  load_count: number;
  revenue_cents: number;
  driver_pay_cents: number;
  fuel_cents: number;
  margin_cents: number;
};

export type LoadsReportPayload = {
  date_field: LoadsReportDateField;
  period: { start: string; end: string };
  totals: LoadsReportTotals;
  rows: LoadsReportRow[];
};

export type LoadsReportQuery = {
  operatingCompanyId: string;
  from: string;
  to: string;
  dateField: LoadsReportDateField;
  customerId?: string;
  driverId?: string;
  unitId?: string;
  trailerId?: string;
  status?: string;
  tripType?: string;
  factoringStatus?: string;
};

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function nullableNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function buildDateExpr(dateField: LoadsReportDateField): string {
  if (dateField === "pickup") {
    return `COALESCE(
      (SELECT (COALESCE(ls.actual_arrival_at, ls.appointment_start_at, ls.created_at))::date
         FROM mdata.load_stops ls
        WHERE ls.load_id = l.id
          AND ls.stop_type = 'pickup'
          AND ls.soft_deleted_at IS NULL
        ORDER BY ls.sequence_number ASC
        LIMIT 1),
      l.created_at::date
    )`;
  }
  if (dateField === "delivery") {
    return `COALESCE(
      (SELECT (COALESCE(ls.actual_departure_at, ls.actual_arrival_at, ls.appointment_end_at))::date
         FROM mdata.load_stops ls
        WHERE ls.load_id = l.id
          AND ls.stop_type = 'delivery'
          AND ls.soft_deleted_at IS NULL
        ORDER BY ls.sequence_number DESC
        LIMIT 1),
      l.updated_at::date,
      l.created_at::date
    )`;
  }
  return `l.created_at::date`;
}

export async function getLoadsReport(client: PoolClient, query: LoadsReportQuery): Promise<LoadsReportPayload> {
  const { operatingCompanyId, from, to, dateField } = query;
  const values: unknown[] = [operatingCompanyId, from, to];
  const filters: string[] = [
    `l.operating_company_id = $1::uuid`,
    `l.soft_deleted_at IS NULL`,
    `l.status IS DISTINCT FROM 'cancelled'`,
    `${buildDateExpr(dateField)} BETWEEN $2::date AND $3::date`,
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
  if (query.trailerId) {
    values.push(query.trailerId);
    filters.push(`EXISTS (
      SELECT 1 FROM dispatch.load_assignment_history lah
      WHERE lah.load_id = l.id
        AND lah.operating_company_id = $1::uuid
        AND lah.new_trailer_id = $${values.length}::uuid
    )`);
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

  const res = await client.query(
    `
      WITH pickup AS (
        SELECT DISTINCT ON (ls.load_id)
          ls.load_id,
          NULLIF(trim(ls.city), '') AS origin_city,
          NULLIF(trim(ls.state), '') AS origin_state,
          (COALESCE(ls.actual_arrival_at, ls.appointment_start_at))::date AS pickup_date
        FROM mdata.load_stops ls
        WHERE ls.stop_type = 'pickup' AND ls.soft_deleted_at IS NULL
        ORDER BY ls.load_id, ls.sequence_number ASC
      ),
      delivery AS (
        SELECT DISTINCT ON (ls.load_id)
          ls.load_id,
          NULLIF(trim(ls.city), '') AS destination_city,
          NULLIF(trim(ls.state), '') AS destination_state,
          (COALESCE(ls.actual_departure_at, ls.actual_arrival_at, ls.appointment_end_at))::date AS delivery_date
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
      )
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
        tr.trailer_id,
        tr.trailer_number,
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
        ${LOAD_COST_ROLLUP_SELECT}
      FROM mdata.loads l
      LEFT JOIN mdata.customers c ON c.id = l.customer_id AND c.operating_company_id = $1::uuid
      LEFT JOIN mdata.units u ON u.id = l.assigned_unit_id
      LEFT JOIN LATERAL (
        SELECT eq.id::text AS trailer_id, eq.equipment_number AS trailer_number
        FROM dispatch.load_assignment_history lah
        JOIN mdata.equipment eq ON eq.id = lah.new_trailer_id
                               AND COALESCE(eq.currently_leased_to_company_id, eq.owner_company_id) = l.operating_company_id
        WHERE lah.load_id = l.id
          AND lah.operating_company_id = l.operating_company_id
          AND lah.new_trailer_id IS NOT NULL
        ORDER BY lah.assigned_at DESC, lah.created_at DESC
        LIMIT 1
      ) tr ON true
      LEFT JOIN pickup p ON p.load_id = l.id
      LEFT JOIN delivery d ON d.load_id = l.id
      LEFT JOIN invoice_info inv ON inv.load_id = l.id
      LEFT JOIN factoring_by_load fbl ON fbl.load_id = l.id
      LEFT JOIN factoring_by_id fbi ON fbi.factoring_advance_id = inv.factoring_advance_id
      ${loadCostRollupLateral("l.id", "$1::uuid")}
      WHERE ${filters.join("\n        AND ")}
      ORDER BY l.load_number DESC NULLS LAST, l.created_at DESC
    `,
    values
  );

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

  const totals = rows.reduce(
    (acc, row) => {
      acc.load_count += 1;
      acc.revenue_cents += row.revenue_cents;
      acc.driver_pay_cents += row.driver_pay_cents;
      acc.fuel_cents += row.fuel_cents;
      acc.margin_cents += row.margin_cents;
      return acc;
    },
    { load_count: 0, revenue_cents: 0, driver_pay_cents: 0, fuel_cents: 0, margin_cents: 0 }
  );

  return { date_field: dateField, period: { start: from, end: to }, totals, rows };
}
