import type { PoolClient } from "pg";
import { notVoided, statusNotCancelled } from "../accounting/live-document-predicates.sql.js";
import { entityIdFilterValues } from "../_helpers/entity-filter-list.js";

/**
 * 443.281-B endpoint 3: paged driver settlements report.
 * Returns one row per settlement with gross/deductions/advances/escrow/net,
 * linked load count, and pagination. Scope: USMCA operating_company_id only.
 */

export type DriversSettlementsQuery = {
  operatingCompanyId: string;
  from: string;
  to: string;
  /** Comma-separated driver uuids (multi-select filter). */
  driverId?: string;
  /** Comma-separated settlement statuses (multi-select filter). */
  status?: string;
  /** "paid" = a payment was issued (payment_sent_at or paid_at stamped); "unpaid" = neither. */
  paid?: "paid" | "unpaid";
  limit: number;
  offset: number;
};

export type DriversSettlementsRow = {
  settlement_id: string;
  /** The settlement's own record number (P-NNNN) — what Settlements shows. */
  display_id: string | null;
  /** AlwaysTrack 4-digit document number (source_document_ref); null until settled. */
  settlement_number: string | null;
  driver_id: string;
  driver_name: string;
  period_start: string;
  period_end: string;
  status: string;
  gross_cents: number;
  deductions_cents: number;
  advances_cents: number;
  escrow_withheld_cents: number;
  net_cents: number;
  load_count: number;
  /** Lowest / highest load number on the settlement (the "Loads" range on the board). */
  first_load_number: string | null;
  last_load_number: string | null;
  first_load_id: string | null;
  last_load_id: string | null;
  /** When the payment was issued: COALESCE(payment_sent_at, paid_at) — the same event the 1099 Box-1 year keys on. */
  paid_at: string | null;
};

export type DriversSettlementsTotals = {
  settlement_count: number;
  gross_cents: number;
  deductions_cents: number;
  advances_cents: number;
  escrow_withheld_cents: number;
  net_cents: number;
};

export type DriversSettlementsPayload = {
  period: { start: string; end: string };
  pagination: { limit: number; offset: number; total: number };
  totals: DriversSettlementsTotals;
  rows: DriversSettlementsRow[];
};

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function getDriversSettlementsReport(
  client: PoolClient,
  query: DriversSettlementsQuery
): Promise<DriversSettlementsPayload> {
  const { operatingCompanyId, from, to, limit, offset } = query;

  const values: unknown[] = [operatingCompanyId, from, to];
  // Rows 80 (11-03 register) — the board's scope: "cancelled excluded" (V3-Reports-DriverSettlements).
  const filters: string[] = [
    `s.period_start >= $2::date`,
    `s.period_end <= $3::date`,
    notVoided("s"),
    statusNotCancelled("s"),
  ];

  if (query.driverId) {
    values.push(entityIdFilterValues(query.driverId));
    filters.push(`s.driver_id = ANY($${values.length}::uuid[])`);
  }
  if (query.status) {
    values.push([...new Set(query.status.split(",").map((v) => v.trim()).filter(Boolean))]);
    filters.push(`s.status::text = ANY($${values.length}::text[])`);
  }
  if (query.paid === "paid") filters.push(`COALESCE(s.payment_sent_at, s.paid_at) IS NOT NULL`);
  if (query.paid === "unpaid") filters.push(`COALESCE(s.payment_sent_at, s.paid_at) IS NULL`);

  const limitIdx = values.length + 1;
  const offsetIdx = values.length + 2;
  values.push(limit, offset);

  const res = await client.query(
    `
      SELECT
        s.id AS settlement_id,
        s.display_id,
        s.source_document_ref AS settlement_number,
        s.driver_id,
        COALESCE(CONCAT_WS(' ', d.first_name, d.last_name), 'Unknown') AS driver_name,
        s.period_start,
        s.period_end,
        s.status,
        COALESCE(ROUND(s.gross_pay::numeric * 100), 0)::bigint AS gross_cents,
        COALESCE(ROUND(s.deductions_total::numeric * 100), 0)::bigint AS deductions_cents,
        COALESCE(ROUND(s.reimbursements_total::numeric * 100), 0)::bigint AS advances_cents,
        COALESCE((
          SELECT SUM(el.amount_cents)
          FROM driver_finance.escrow_ledger el
          WHERE el.driver_id = s.driver_id
            AND el.operating_company_id = $1::uuid
            AND el.settlement_id = s.id
            AND el.transaction_type = 'hold'
        ), 0)::bigint AS escrow_withheld_cents,
        COALESCE(ROUND(s.net_pay::numeric * 100), 0)::bigint AS net_cents,
        COALESCE((
          SELECT COUNT(DISTINCT l.id)
          FROM mdata.loads l
          WHERE l.presettlement_link_id = s.id
            AND l.operating_company_id = $1::uuid
        ), 0)::int AS load_count,
        lr.first_load_number,
        lr.last_load_number,
        lr.first_load_id,
        lr.last_load_id,
        COALESCE(s.payment_sent_at, s.paid_at)::text AS paid_at,
        COUNT(*) OVER () AS _total_count,
        -- Totals over the WHOLE filtered set (not just this page) so the board's KPIs never total one page.
        SUM(COALESCE(ROUND(s.gross_pay::numeric * 100), 0)) OVER () AS _total_gross_cents,
        SUM(COALESCE(ROUND(s.deductions_total::numeric * 100), 0)) OVER () AS _total_deductions_cents,
        SUM(COALESCE(ROUND(s.reimbursements_total::numeric * 100), 0)) OVER () AS _total_advances_cents,
        SUM(COALESCE(ROUND(s.net_pay::numeric * 100), 0)) OVER () AS _total_net_cents
      FROM driver_finance.driver_settlements s
      LEFT JOIN mdata.drivers d ON d.id = s.driver_id AND d.operating_company_id = s.operating_company_id
      LEFT JOIN LATERAL (
        SELECT
          (array_agg(l.load_number ORDER BY l.load_number ASC))[1] AS first_load_number,
          (array_agg(l.load_number ORDER BY l.load_number DESC))[1] AS last_load_number,
          (array_agg(l.id::text ORDER BY l.load_number ASC))[1] AS first_load_id,
          (array_agg(l.id::text ORDER BY l.load_number DESC))[1] AS last_load_id
        FROM mdata.loads l
        WHERE l.presettlement_link_id = s.id
          AND l.operating_company_id = $1::uuid
      ) lr ON true
      WHERE s.operating_company_id = $1::uuid
        AND ${filters.join("\n        AND ")}
      ORDER BY s.period_end DESC, s.created_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `,
    values
  );

  const total = res.rows.length > 0 ? num(res.rows[0]._total_count) : 0;

  const rows: DriversSettlementsRow[] = (res.rows as Array<Record<string, unknown>>).map((row) => ({
    settlement_id: String(row.settlement_id),
    display_id: row.display_id != null ? String(row.display_id) : null,
    settlement_number: row.settlement_number != null ? String(row.settlement_number) : null,
    driver_id: String(row.driver_id),
    driver_name: String(row.driver_name),
    period_start: String(row.period_start).slice(0, 10),
    period_end: String(row.period_end).slice(0, 10),
    status: String(row.status),
    gross_cents: num(row.gross_cents),
    deductions_cents: num(row.deductions_cents),
    advances_cents: num(row.advances_cents),
    escrow_withheld_cents: num(row.escrow_withheld_cents),
    net_cents: num(row.net_cents),
    load_count: num(row.load_count),
    first_load_number: row.first_load_number != null ? String(row.first_load_number) : null,
    last_load_number: row.last_load_number != null ? String(row.last_load_number) : null,
    first_load_id: row.first_load_id != null ? String(row.first_load_id) : null,
    last_load_id: row.last_load_id != null ? String(row.last_load_id) : null,
    paid_at: row.paid_at != null ? String(row.paid_at) : null,
  }));

  const first = (res.rows[0] ?? {}) as Record<string, unknown>;
  const whole = (key: string, fallback: number) => (first[key] != null ? num(first[key]) : fallback);
  const totals: DriversSettlementsTotals = {
    settlement_count: total,
    gross_cents: whole("_total_gross_cents", rows.reduce((s, r) => s + r.gross_cents, 0)),
    deductions_cents: whole("_total_deductions_cents", rows.reduce((s, r) => s + r.deductions_cents, 0)),
    advances_cents: whole("_total_advances_cents", rows.reduce((s, r) => s + r.advances_cents, 0)),
    escrow_withheld_cents: rows.reduce((s, r) => s + r.escrow_withheld_cents, 0),
    net_cents: whole("_total_net_cents", rows.reduce((s, r) => s + r.net_cents, 0)),
  };

  return {
    period: { start: from, end: to },
    pagination: { limit, offset, total },
    totals,
    rows,
  };
}
