/**
 * LEAD 443.110 G9 — a driver bill carries the truck and the trailer of its load. ONE rule for every driver-bill writer
 * (book-load mint, team split, historical backfill, void-and-reissue): the unit is the load's assigned_unit_id; the trailer is
 * accounting/load-trailer.sql.ts — the company trailer (sameEntityLoadCompanyTrailerSql) or, on a customer-trailer load, the
 * non-owned trailer (loadNonOwnedTrailerSql). Never both (driver_bills_one_trailer_kind).
 *
 * Only OPEN, unsettled, unvoided bills are (re)stamped: a settled or voided bill is a closed document and keeps what it said.
 * Called after a writer inserts its bill, and after Book / Edit Load records the trailer (book-load writes the trailer after
 * the bill is minted, so the mint-time stamp is completed there).
 */
import { loadNonOwnedTrailerSql, sameEntityLoadCompanyTrailerSql } from "../accounting/load-trailer.sql.js";

type Queryable = { query: (sql: string, params?: unknown[]) => Promise<{ rowCount: number | null }> };

export async function restampDriverBillUnitAndTrailer(
  client: Queryable,
  input: { operatingCompanyId: string; loadId: string }
): Promise<number> {
  const res = await client.query(
    `UPDATE driver_finance.driver_bills b
        SET unit_id = l.assigned_unit_id,
            trailer_id = ${sameEntityLoadCompanyTrailerSql("l.id", "l.operating_company_id")},
            non_owned_trailer_id = ${loadNonOwnedTrailerSql("l.id", "l.operating_company_id")}
       FROM mdata.loads l
      WHERE b.load_id = l.id AND l.id = $1::uuid
        AND b.operating_company_id = $2::uuid AND l.operating_company_id = $2::uuid
        AND b.voided_at IS NULL AND b.settled_in_settlement_id IS NULL AND b.status = 'open'
        AND (b.unit_id IS DISTINCT FROM l.assigned_unit_id
          OR b.trailer_id IS DISTINCT FROM ${sameEntityLoadCompanyTrailerSql("l.id", "l.operating_company_id")}
          OR b.non_owned_trailer_id IS DISTINCT FROM ${loadNonOwnedTrailerSql("l.id", "l.operating_company_id")})`,
    [input.loadId, input.operatingCompanyId]
  );
  return res.rowCount ?? 0;
}
