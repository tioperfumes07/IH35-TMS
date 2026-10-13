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

/**
 * LEAD 443.137 #1 (owner GO 2026-10-12: "Fill them through the engine from each bill's load ... metadata only, no money moves,
 * no repost") — the ONE exception to "a settled bill keeps what it said": SETTLED per-load driver bills minted before G9 carry no
 * unit / trailer at all. Fill-only from the bill's load by the same rule as restampDriverBillUnitAndTrailer (unit = the load's
 * assigned_unit_id; trailer = the company trailer (load-trailer.sql.ts, same-entity) or the customer's non-owned trailer; never
 * both) — a value already on the bill is never changed, and nothing else on the bill (amount, status, settlement) is touched.
 * One audit row per bill. Returns what was filled.
 */
export async function backStampSettledDriverBillUnitAndTrailer(
  client: { query: <R = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<{ rows: R[]; rowCount: number | null }> },
  input: { operatingCompanyId: string; actorUserId: string; authorization: string }
): Promise<Array<{ id: string; load_id: string; unit_id: string | null; trailer_id: string | null; non_owned_trailer_id: string | null }>> {
  const res = await client.query<{ id: string; load_id: string; unit_id: string | null; trailer_id: string | null; non_owned_trailer_id: string | null }>(
    `UPDATE driver_finance.driver_bills b
        SET unit_id = COALESCE(b.unit_id, l.assigned_unit_id),
            trailer_id = CASE WHEN b.trailer_id IS NULL AND b.non_owned_trailer_id IS NULL
                              THEN ${sameEntityLoadCompanyTrailerSql("l.id", "l.operating_company_id")} ELSE b.trailer_id END,
            non_owned_trailer_id = CASE WHEN b.trailer_id IS NULL AND b.non_owned_trailer_id IS NULL
                                        THEN ${loadNonOwnedTrailerSql("l.id", "l.operating_company_id")} ELSE b.non_owned_trailer_id END
       FROM mdata.loads l
      WHERE b.load_id = l.id AND b.operating_company_id = $1::uuid AND l.operating_company_id = $1::uuid
        AND b.voided_at IS NULL AND b.settled_in_settlement_id IS NOT NULL
        AND ((b.unit_id IS NULL AND l.assigned_unit_id IS NOT NULL)
          OR (b.trailer_id IS NULL AND b.non_owned_trailer_id IS NULL
              AND COALESCE(${sameEntityLoadCompanyTrailerSql("l.id", "l.operating_company_id")}, ${loadNonOwnedTrailerSql("l.id", "l.operating_company_id")}) IS NOT NULL))
      RETURNING b.id::text, b.load_id::text, b.unit_id::text, b.trailer_id::text, b.non_owned_trailer_id::text`,
    [input.operatingCompanyId]
  );
  for (const r of res.rows) {
    await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, $4::uuid, $5)`, [
      "driver_finance.driver_bill.unit_trailer_backstamped",
      "info",
      JSON.stringify({ operating_company_id: input.operatingCompanyId, driver_bill_id: r.id, load_id: r.load_id, unit_id: r.unit_id, trailer_id: r.trailer_id, non_owned_trailer_id: r.non_owned_trailer_id, authorization: input.authorization }),
      input.actorUserId,
      "443.137-1",
    ]);
  }
  return res.rows;
}
