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
  /**
   * WHERE THE MILES CAME FROM, stated on every row and never blank when miles are present:
   *   'short' | 'practical'                  — the driver bill's own basis, as agreed
   *   'practical (load)' | 'short (load)'    — filled from mdata.loads because the bill had none
   * A settlement that prints a mileage without saying which number it is cannot be audited, and
   * a driver cannot check his own pay against it.
   */
  miles_basis_type: string | null;
  rate_per_mile_cents: number | null;
  /**
   * True when rate_per_mile_cents was DIVIDED OUT of gross ÷ miles rather than read from an agreed
   * rate on the bill. An effective rate is not a contracted rate and is never printed as one.
   */
  rate_is_effective?: boolean | null;
  /** First pickup → last delivery, from mdata.load_stops. Null when the load has no stops. */
  lane: string | null;
  /** Actual departure from the first pickup, else its scheduled/appointment time. */
  pickup_at: string | null;
  /** Actual arrival at the last delivery, else its scheduled/appointment time. */
  delivery_at: string | null;
  notes: string | null;
};

export async function listDriverBillsForSettlementPeriod(
  client: DbClient,
  input: { operatingCompanyId: string; driverId: string; periodStart: string; periodEnd: string }
): Promise<DriverBillSettlementRow[]> {
  const res = await client.query<DriverBillSettlementRow>(
    `
      WITH load_lane AS (
        -- S-01 (Lead, 2026-09-30) — THE SETTLEMENT LEGS WERE PRINTING A BACKFILL MEMO AS THE LANE
        -- and an em dash for miles, rate, pickup date and delivery date. Measured live on
        -- br-fancy-credit-akjnd07a, USMCA 5c854333-6ea5-4faa-af31-67cb272fef80:
        --   driver_finance.driver_bills            138 rows, 138 with load_id and load_number
        --   of those, miles_basis populated         99
        --   of those, rate_per_mile_cents           97
        --   bills with NO miles whose LOAD has them  every one sampled, e.g.
        --     bill 13577 miles_basis NULL -> mdata.loads.miles_practical 1435.9 (source History)
        --     bill 13594 miles_basis NULL -> 1494.8 (History)
        --     bill 13599 miles_basis NULL -> 1950.9 (History)
        --   and their notes column, which was being printed as the lane, reads
        --     "Historical backfill from settlement 5797 — amount as printed"
        -- The miles and the lane were in mdata.loads and mdata.load_stops the whole time. The
        -- document simply never asked for them.
        SELECT
          s.load_id,
          (SELECT concat_ws(', ', p.city, p.state)
             FROM mdata.load_stops p
            WHERE p.load_id = s.load_id AND p.soft_deleted_at IS NULL
              AND p.stop_type::text = 'pickup'
            ORDER BY p.sequence_number ASC LIMIT 1) AS origin_label,
          (SELECT concat_ws(', ', d.city, d.state)
             FROM mdata.load_stops d
            WHERE d.load_id = s.load_id AND d.soft_deleted_at IS NULL
              AND d.stop_type::text = 'delivery'
            ORDER BY d.sequence_number DESC LIMIT 1) AS dest_label,
          (SELECT COALESCE(p.actual_departure_at, p.appointment_start_at, p.scheduled_arrival_at)
             FROM mdata.load_stops p
            WHERE p.load_id = s.load_id AND p.soft_deleted_at IS NULL
              AND p.stop_type::text = 'pickup'
            ORDER BY p.sequence_number ASC LIMIT 1) AS pickup_at,
          (SELECT COALESCE(d.actual_arrival_at, d.appointment_start_at, d.scheduled_arrival_at)
             FROM mdata.load_stops d
            WHERE d.load_id = s.load_id AND d.soft_deleted_at IS NULL
              AND d.stop_type::text = 'delivery'
            ORDER BY d.sequence_number DESC LIMIT 1) AS delivery_at
        FROM (SELECT DISTINCT load_id FROM mdata.load_stops WHERE soft_deleted_at IS NULL) s
      )
      SELECT
        picked.id,
        picked.load_number,
        picked.bill_number,
        picked.gross_amount_cents,
        picked.miles_basis,
        picked.miles_basis_type,
        picked.rate_per_mile_cents,
        picked.rate_is_effective,
        picked.lane,
        picked.pickup_at,
        picked.delivery_at,
        picked.notes
      FROM (
        SELECT DISTINCT ON (dedupe_key)
          dedupe_key,
          id,
          load_number,
          bill_number,
          gross_amount_cents,
          miles_basis,
          miles_basis_type,
          rate_per_mile_cents,
          rate_is_effective,
          lane,
          pickup_at,
          delivery_at,
          notes
        FROM (
          SELECT
            COALESCE(db.load_id::text, db.bill_number, db.id::text) AS dedupe_key,
            1 AS src_rank,
            db.id::text AS id,
            db.load_number,
            db.bill_number,
            db.gross_amount_cents,
            -- the bill's own basis wins; mdata.loads fills the gap and SAYS so.
            COALESCE(db.miles_basis, dbl.miles_practical, dbl.miles_shortest) AS miles_basis,
            CASE
              WHEN db.miles_basis IS NOT NULL THEN db.miles_basis_type
              WHEN COALESCE(dbl.miles_practical, 0) > 0 THEN 'practical (load)'
              WHEN COALESCE(dbl.miles_shortest, 0) > 0 THEN 'short (load)'
              ELSE NULL
            END AS miles_basis_type,
            -- filled ONLY when the bill itself has none; an agreed rate is never overwritten.
            COALESCE(
              db.rate_per_mile_cents,
              CASE
                WHEN db.miles_basis IS NULL
                 AND COALESCE(dbl.miles_practical, dbl.miles_shortest, 0) > 0
                 AND COALESCE(db.gross_amount_cents, 0) <> 0
                THEN ROUND(db.gross_amount_cents::numeric
                           / NULLIF(COALESCE(dbl.miles_practical, dbl.miles_shortest), 0))::integer
                ELSE NULL
              END
            ) AS rate_per_mile_cents,
            (db.rate_per_mile_cents IS NULL
             AND db.miles_basis IS NULL
             AND COALESCE(dbl.miles_practical, dbl.miles_shortest, 0) > 0
             AND COALESCE(db.gross_amount_cents, 0) <> 0) AS rate_is_effective,
            NULLIF(concat_ws(' \u2192 ', dbll.origin_label, dbll.dest_label), '') AS lane,
            dbll.pickup_at::text AS pickup_at,
            dbll.delivery_at::text AS delivery_at,
            db.notes
          FROM driver_finance.driver_bills db
          LEFT JOIN mdata.loads dbl
            ON dbl.id = db.load_id
           AND dbl.operating_company_id = db.operating_company_id
           AND dbl.soft_deleted_at IS NULL
          LEFT JOIN load_lane dbll ON dbll.load_id = db.load_id
          WHERE db.operating_company_id = $1::uuid
            AND db.driver_id = $2
            AND db.created_at::date >= $3::date
            AND db.created_at::date <= $4::date
            AND db.status <> 'void'

          UNION ALL

          SELECT
            COALESCE(l.id::text, ab.id::text) AS dedupe_key,
            2 AS src_rank,
            ab.id::text AS id,
            l.load_number,
            -- GO-19 slice 03 — driver bill number EQUALS the load number, no 'B-' prefix (matches
            -- driver-bill-number.ts's driverBillNumberFromLoadNumber contract). This legacy-bridge
            -- branch (accounting.bills rows never mirrored into driver_finance.driver_bills) used to
            -- fabricate a distinct 'B-'-prefixed display id here; now it renders the same load number
            -- a dispatcher already sees, matching the canonical (non-legacy) branch above.
            l.load_number AS bill_number,
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
            -- this branch has no agreed rate to read: every rate it shows is gross divided by
            -- miles, so it is ALWAYS effective and is labelled as such. Calling a divided-out
            -- number a contracted rate is how a driver ends up arguing with a number nobody set.
            (COALESCE(l.miles_shortest, l.miles_practical, 0) > 0
             AND COALESCE(ab.amount_cents, 0) <> 0) AS rate_is_effective,
            NULLIF(concat_ws(' \u2192 ', abll.origin_label, abll.dest_label), '') AS lane,
            abll.pickup_at::text AS pickup_at,
            abll.delivery_at::text AS delivery_at,
            ab.memo AS notes
          FROM accounting.bills ab
          INNER JOIN mdata.loads l
            ON l.operating_company_id = ab.operating_company_id
           AND regexp_replace(regexp_replace(COALESCE(ab.display_id, ab.bill_number, ''), '^[Bb]-', ''), '^[Ll]-', '')
              = regexp_replace(l.load_number, '^[Ll]-', '')
           AND l.soft_deleted_at IS NULL
          LEFT JOIN load_lane abll ON abll.load_id = l.id
          WHERE ab.operating_company_id = $1::uuid
            AND COALESCE(l.assigned_primary_driver_id, l.assigned_secondary_driver_id) = $2
            AND ab.created_at::date >= $3::date
            AND ab.created_at::date <= $4::date
            AND ab.revoked_at IS NULL
            AND ab.memo ILIKE 'Auto-created from load %'
            AND NOT EXISTS (
              SELECT 1 FROM driver_finance.driver_bills db2
              WHERE db2.source_legacy_bill_id = ab.id
            )
            AND NOT EXISTS (
              SELECT 1 FROM driver_finance.driver_bills db3
              WHERE db3.load_id = l.id
                AND db3.operating_company_id = ab.operating_company_id
            )
        ) unioned
        ORDER BY dedupe_key ASC, src_rank ASC, id DESC
      ) picked
      ORDER BY picked.bill_number ASC NULLS LAST
    `,
    [input.operatingCompanyId, input.driverId, input.periodStart, input.periodEnd]
  );
  return res.rows;
}

/**
 * S-01 — the lane column was printing `notes`, which on every backfilled bill is the memo
 * "Historical backfill from settlement NNNN — amount as printed". That is a bookkeeping note, not
 * a lane, and a settlement that shows it tells the driver nothing about the trip he ran.
 *
 * The lane now comes from mdata.load_stops (first pickup → last delivery) and the dates with it.
 * `notes` is kept only as the last fallback, for a bill with no load behind it at all.
 *
 * Miles and rate print PLAIN on the driver document — owner ruling 2026-09-30: "The driver just
 * needs to know the miles he is being paid, not short, driven or practical. That is for us." The
 * basis and the effective-rate flag are still resolved and still carried on the row for the company
 * settlement and the audit trail; they are simply not printed on a driver's pay document.
 */
/**
 * S-01 — pickup/delivery dates for the lane column. Dates are printed only when the underlying
 * stop actually carries one; a missing date stays missing rather than being filled with the
 * settlement period or today.
 */
function formatLaneDates(pickupAt: string | null, deliveryAt: string | null): string | null {
  const fmt = (value: string | null): string | null => {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}/${d.getUTCFullYear()}`;
  };
  const pu = fmt(pickupAt);
  const del = fmt(deliveryAt);
  if (pu && del) return `PU ${pu} \u2192 DEL ${del}`;
  if (pu) return `PU ${pu}`;
  if (del) return `DEL ${del}`;
  return null;
}

export function driverBillRowsToSettlementLoads(rows: DriverBillSettlementRow[]): SettlementLoadRow[] {
  return rows.map((row) => {
    const gross = Number(row.gross_amount_cents ?? 0);
    // OWNER RULING 2026-09-30: "The driver just needs to know the miles he is being paid, not
    // short, driven or practical. That is for us."
    //
    // So the DRIVER document prints the number he is paid on and nothing else. No basis suffix, no
    // "eff" marker — those are internal accounting distinctions and putting them on a pay document
    // invites an argument about a word the driver was never party to.
    //
    // The source is NOT discarded: miles_basis_type and rate_is_effective still ride on
    // DriverBillSettlementRow and are still resolved by the query, for the company settlement, the
    // audit trail and any internal report that must state which mileage it counted. This function
    // is the driver-facing renderer, and only here is the label dropped.
    const milesNum = row.miles_basis != null ? Number(row.miles_basis) : null;
    const miles =
      milesNum != null && Number.isFinite(milesNum) ? Math.round(milesNum).toLocaleString("en-US") : "—";
    const rpm =
      row.rate_per_mile_cents != null && Number.isFinite(Number(row.rate_per_mile_cents))
        ? `${formatMoney(Number(row.rate_per_mile_cents))}/mi`
        : "—";
    const loadNum = String(row.load_number ?? "—").toUpperCase();
    const dateRange = formatLaneDates(row.pickup_at ?? null, row.delivery_at ?? null);
    const laneLabel = row.lane && String(row.lane).trim().length > 0 ? String(row.lane).trim() : null;
    const laneFallback = String(row.notes ?? row.bill_number ?? "Driver bill").trim() || "Driver bill";
    const lane = laneLabel ? `${laneLabel}${dateRange ? `  ·  ${dateRange}` : ""}` : laneFallback;
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

export {
  aggregateSettlementTotals,
  closeSettlementForFinalLoad,
  getActiveSettlementForDriver,
  openLoadBookendedSettlement,
  pingSettlementOnLoadEvent,
  settlementDisplayIdFromLoadNumber,
} from "./settlements-load-bookended.service.js";
