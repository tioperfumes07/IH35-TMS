import { loadAtTimeForDriverSql, loadAtTimeSql } from "../maintenance/driver-attribution.js";
import { loadNonOwnedTrailerSql, sameEntityLoadCompanyTrailerSql } from "../accounting/load-trailer.sql.js";

/**
 * LEAD 443.110 G7 — THE one fuel-to-load rule. Every fuel source (the fuel-card import, the Relay fill posted at bank
 * match, the Relay rematch) asks "which load was this truck running when it filled" here, and nowhere else.
 *
 *   1. the load the UNIT was running at the fill time — loadAtTimeSql (maintenance/driver-attribution.ts): actual stop
 *      stamps first (date-only stamps count to the end of their day), the delivery fence exit, NB-then-return aware
 *      (earliest-pickup unfinished), never created_at;
 *   2. else the load the DRIVER was running at that time (same rule keyed on the primary / secondary seat);
 *   3. else no load (null) — never a guess.
 *
 * Before this, the import used its own ±1-day scheduled-window match that ignored actual times and refused any overlap,
 * while the Relay post used loadAtTimeSql: the same fill could land on two different loads depending on its source.
 *
 * The trailer comes from the load through the one trailer rule (accounting/load-trailer.sql.ts): the load's company
 * trailer, or — for a customer-trailer load — no company trailer (the fill carries the load; the customer trailer
 * stays on the load).
 */
type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }>;
};

export type FuelLoadAtTime = {
  load_id: string;
  load_number: string | null;
  matched_by: "unit" | "driver";
  trailer_id: string | null;
  non_owned_trailer_id: string | null;
};

export async function resolveFuelLoadAtTime(
  client: DbClient,
  input: { operatingCompanyId: string; unitId: string | null; driverId: string | null; at: string }
): Promise<FuelLoadAtTime | null> {
  if (!input.unitId && !input.driverId) return null;
  const res = await client.query<{
    load_id: string | null;
    load_number: string | null;
    matched_by: "unit" | "driver" | null;
    trailer_id: string | null;
    non_owned_trailer_id: string | null;
  }>(
    `
      SELECT hit.load_id::text AS load_id,
             l.load_number::text AS load_number,
             hit.matched_by,
             ${sameEntityLoadCompanyTrailerSql("l.id", "l.operating_company_id")}::text AS trailer_id,
             ${loadNonOwnedTrailerSql("l.id", "l.operating_company_id")}::text AS non_owned_trailer_id
        FROM (SELECT $2::uuid AS unit_id, $3::uuid AS driver_id) x
        ${loadAtTimeSql("x.unit_id", "$4::timestamptz", "by_unit")}
        ${loadAtTimeForDriverSql("x.driver_id", "$4::timestamptz", "by_driver")}
        CROSS JOIN LATERAL (
          SELECT COALESCE(by_unit.load_id, by_driver.load_id) AS load_id,
                 CASE WHEN by_unit.load_id IS NOT NULL THEN 'unit'
                      WHEN by_driver.load_id IS NOT NULL THEN 'driver' END AS matched_by
        ) hit
        LEFT JOIN mdata.loads l ON l.id = hit.load_id AND l.operating_company_id = $1::uuid
    `,
    [input.operatingCompanyId, input.unitId, input.driverId, input.at]
  );
  const row = res.rows[0];
  if (!row?.load_id || !row.matched_by) return null;
  return {
    load_id: row.load_id,
    load_number: row.load_number,
    matched_by: row.matched_by,
    trailer_id: row.trailer_id,
    non_owned_trailer_id: row.non_owned_trailer_id,
  };
}
