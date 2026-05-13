import type { SettlementLoadRow } from "../render/settlement.template.js";
import { formatMoney } from "../render/pdf-template.js";
import { driverBillNumberFromLoadNumber } from "./driver-bill-number.js";

type DbClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export type DriverBillSettlementRow = {
  id: string;
  load_number: string | null;
  bill_number: string | null;
  gross_amount_cents: number | null;
  miles_basis: number | null;
  miles_basis_type: string | null;
  rate_per_mile_cents: number | null;
  notes: string | null;
};

export async function listDriverBillsForSettlementPeriod(
  client: DbClient,
  input: { operatingCompanyId: string; driverId: string; periodStart: string; periodEnd: string }
): Promise<DriverBillSettlementRow[]> {
  const res = await client.query<DriverBillSettlementRow>(
    `
      SELECT
        x.id,
        x.load_number,
        x.bill_number,
        x.gross_amount_cents,
        x.miles_basis,
        x.miles_basis_type,
        x.rate_per_mile_cents,
        x.notes
      FROM (
        SELECT
          db.id::text AS id,
          db.load_number,
          db.bill_number,
          db.gross_amount_cents,
          db.miles_basis,
          db.miles_basis_type,
          db.rate_per_mile_cents,
          db.notes
        FROM driver_finance.driver_bills db
        WHERE db.operating_company_id = $1
          AND db.driver_id = $2
          AND db.created_at::date >= $3::date
          AND db.created_at::date <= $4::date
          AND db.status <> 'void'

        UNION ALL

        SELECT
          ab.id::text AS id,
          l.load_number,
          ('B-' || regexp_replace(l.load_number, '^[Ll]-', '')) AS bill_number,
          LEAST(GREATEST(COALESCE(ab.amount_cents, 0), -2147483648::bigint), 2147483647::bigint)::integer AS gross_amount_cents,
          CASE
            WHEN COALESCE(l.miles_shortest, 0) > 0 THEN l.miles_shortest
            WHEN COALESCE(l.miles_practical, 0) > 0 THEN l.miles_practical
            ELSE NULL
          END AS miles_basis,
          CASE
            WHEN COALESCE(l.miles_shortest, 0) > 0 THEN 'short'::text
            WHEN COALESCE(l.miles_practical, 0) > 0 THEN 'practical'::text
            ELSE NULL
          END AS miles_basis_type,
          CASE
            WHEN COALESCE(l.miles_shortest, 0) > 0 AND COALESCE(ab.amount_cents, 0) <> 0
              THEN ROUND(ab.amount_cents::numeric / NULLIF(l.miles_shortest, 0))::integer
            WHEN COALESCE(l.miles_practical, 0) > 0 AND COALESCE(ab.amount_cents, 0) <> 0
              THEN ROUND(ab.amount_cents::numeric / NULLIF(l.miles_practical, 0))::integer
            ELSE NULL
          END AS rate_per_mile_cents,
          ab.memo AS notes
        FROM accounting.bills ab
        INNER JOIN mdata.loads l
          ON l.operating_company_id = ab.operating_company_id
         AND regexp_replace(regexp_replace(COALESCE(ab.display_id, ab.bill_number, ''), '^[Bb]-', ''), '^[Ll]-', '')
            = regexp_replace(l.load_number, '^[Ll]-', '')
         AND l.soft_deleted_at IS NULL
        WHERE ab.operating_company_id = $1
          AND COALESCE(l.assigned_primary_driver_id, l.assigned_secondary_driver_id) = $2
          AND ab.created_at::date >= $3::date
          AND ab.created_at::date <= $4::date
          AND ab.revoked_at IS NULL
          AND ab.memo ILIKE 'Auto-created from load %'
          AND NOT EXISTS (
            SELECT 1 FROM driver_finance.driver_bills db2
            WHERE db2.source_legacy_bill_id = ab.id
          )
      ) x
      ORDER BY x.bill_number ASC
    `,
    [input.operatingCompanyId, input.driverId, input.periodStart, input.periodEnd]
  );
  return res.rows;
}

export function driverBillRowsToSettlementLoads(rows: DriverBillSettlementRow[]): SettlementLoadRow[] {
  return rows.map((row) => {
    const gross = Number(row.gross_amount_cents ?? 0);
    const miles = row.miles_basis != null ? String(row.miles_basis) : "—";
    const rpm =
      row.rate_per_mile_cents != null && Number.isFinite(Number(row.rate_per_mile_cents))
        ? `${formatMoney(Number(row.rate_per_mile_cents))}/mi`
        : "—";
    const loadNum = String(row.load_number ?? "—").toUpperCase();
    const lane = String(row.notes ?? row.bill_number ?? "Driver bill").trim() || "Driver bill";
    return {
      loadNum,
      lane,
      shortMi: miles,
      ratePerMi: rpm,
      linehaulCents: Math.max(gross, 0),
      bonusesDisplay: "—",
      lineTotalCents: Math.max(gross, 0),
    };
  });
}

export function settlementLoadRowsCoveringInvariant(loadNumber: string, billNumber: string): boolean {
  return driverBillNumberFromLoadNumber(loadNumber) === billNumber;
}
