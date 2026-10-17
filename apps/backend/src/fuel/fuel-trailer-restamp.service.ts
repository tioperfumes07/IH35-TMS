/**
 * LEAD 443.185 G7 re-stamp (Lead ruling 03:40Z) — a fuel row that already names its load but no trailer takes the
 * trailer of that load from the ONE trailer rule (load-trailer.sql.ts sameEntityLoadCompanyTrailerSql — the same
 * trailer every fuel writer now takes from resolveFuelLoadAtTime). Evidence already on the row: its load_id.
 *
 * Fill-null only (never overwrites a trailer), never a reefer fill (U25: a reefer fill's trailer is the Reefer trailer
 * it fueled, set by hand), never a voided row, never another company's equipment (the rule is same-entity), never a
 * customer-trailer load (the rule returns none). Moves no money: no posting, no document, no amount. One audit event
 * per stamped row (beside the row-level audit trigger).
 */
import { appendCrudAudit } from "../audit/crud-audit.js";
import { sameEntityLoadCompanyTrailerSql } from "../accounting/load-trailer.sql.js";

type Queryable = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }> };

export type FuelTrailerRestamp = { fuel_transaction_id: string; load_id: string; trailer_id: string };

export async function restampFuelTrailersFromLoad(
  client: Queryable,
  input: { operatingCompanyId: string; actorUserId: string; fuelTransactionIds: string[] }
): Promise<FuelTrailerRestamp[]> {
  if (!input.fuelTransactionIds.length) return [];
  const res = await client.query<FuelTrailerRestamp>(
    `UPDATE fuel.fuel_transactions ft
        SET trailer_id = ${sameEntityLoadCompanyTrailerSql("ft.load_id", "ft.operating_company_id")},
            updated_at = now()
      WHERE ft.operating_company_id = $1::uuid
        AND ft.id = ANY($2::uuid[])
        AND ft.voided_at IS NULL
        AND ft.trailer_id IS NULL
        AND ft.load_id IS NOT NULL
        AND ft.fuel_type::text <> 'reefer_diesel'
        AND ${sameEntityLoadCompanyTrailerSql("ft.load_id", "ft.operating_company_id")} IS NOT NULL
      RETURNING ft.id::text AS fuel_transaction_id, ft.load_id::text AS load_id, ft.trailer_id::text AS trailer_id`,
    [input.operatingCompanyId, input.fuelTransactionIds]
  );
  for (const row of res.rows) {
    await appendCrudAudit(
      client,
      input.actorUserId,
      "fuel.trailer_restamped_from_load",
      { ...row, operating_company_id: input.operatingCompanyId, rule: "load-trailer.sql sameEntityLoadCompanyTrailerSql", round: "LEAD 443.185 G7 (ruling 03:40Z)" },
      "info",
      "LEAD-443-185-G7"
    );
  }
  return res.rows;
}
