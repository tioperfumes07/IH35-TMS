/**
 * LEAD 443.112 #2 (Codex finding, verified on prod) — a driver advance tied to a load carries the load's unit and trailer.
 * Forward: cash-advance-create.ts takes them from the load (443.110 G9, #26631). This stamps an EXISTING advance written
 * before that: fills unit_id / trailer_id from its load through the one trailer rule (accounting/load-trailer.sql.ts —
 * the company trailer the load's assignment recorded, owned / leased by the company). Fill-only: a value already on the
 * advance is never overwritten (a different one is refused by name); no amount, status or journal entry changes; one audit
 * row per advance.
 */
import { appendCrudAudit } from "../audit/crud-audit.js";
import { sameEntityLoadCompanyTrailerSql } from "../accounting/load-trailer.sql.js";

type Queryable = { query: <R = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<{ rows: R[]; rowCount: number | null }> };

export class AdvanceUnitTrailerStampError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "AdvanceUnitTrailerStampError";
  }
}

export async function stampAdvanceUnitTrailerFromLoad(
  client: Queryable,
  input: { operatingCompanyId: string; advanceId: string; actorUserId: string; authorization: string }
): Promise<{ advance_id: string; display_id: string | null; unit_id: string | null; trailer_id: string | null; changed: string[] }> {
  const row = (
    await client.query<{ display_id: string | null; load_id: string | null; unit_id: string | null; trailer_id: string | null; load_unit: string | null; load_trailer: string | null }>(
      `SELECT a.display_id, a.load_id::text, a.unit_id::text, a.trailer_id::text,
              l.assigned_unit_id::text AS load_unit,
              ${sameEntityLoadCompanyTrailerSql("l.id", "l.operating_company_id")}::text AS load_trailer
         FROM driver_finance.driver_advances a
         LEFT JOIN mdata.loads l ON l.id = a.load_id AND l.operating_company_id = a.operating_company_id
        WHERE a.id = $1::uuid AND a.operating_company_id = $2::uuid
        FOR UPDATE OF a`,
      [input.advanceId, input.operatingCompanyId]
    )
  ).rows[0];
  if (!row) throw new AdvanceUnitTrailerStampError("ADVANCE_NOT_FOUND", `advance ${input.advanceId} not found in this company`);
  if (!row.load_id) throw new AdvanceUnitTrailerStampError("ADVANCE_HAS_NO_LOAD", `advance ${row.display_id ?? input.advanceId} names no load`);
  if (row.unit_id && row.load_unit && row.unit_id !== row.load_unit) {
    throw new AdvanceUnitTrailerStampError("UNIT_DIFFERS_FROM_LOAD", `advance ${row.display_id} names a different unit than its load — never overwritten`);
  }
  if (row.trailer_id && row.load_trailer && row.trailer_id !== row.load_trailer) {
    throw new AdvanceUnitTrailerStampError("TRAILER_DIFFERS_FROM_LOAD", `advance ${row.display_id} names a different trailer than its load — never overwritten`);
  }
  const changed: string[] = [];
  const unit = row.unit_id ?? row.load_unit;
  const trailer = row.trailer_id ?? row.load_trailer;
  if (!row.unit_id && row.load_unit) changed.push("unit_id");
  if (!row.trailer_id && row.load_trailer) changed.push("trailer_id");
  if (changed.length === 0) return { advance_id: input.advanceId, display_id: row.display_id, unit_id: unit, trailer_id: trailer, changed };

  const updated = await client.query(
    `UPDATE driver_finance.driver_advances SET unit_id = COALESCE(unit_id, $3::uuid), trailer_id = COALESCE(trailer_id, $4::uuid)
      WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
    [input.advanceId, input.operatingCompanyId, row.load_unit, row.load_trailer]
  );
  if (updated.rowCount !== 1) throw new AdvanceUnitTrailerStampError("STAMP_RACED", "the advance changed while it was being stamped");
  await appendCrudAudit(client as never, input.actorUserId, "driver_finance.driver_advance.unit_trailer_stamped", {
    operating_company_id: input.operatingCompanyId,
    advance_id: input.advanceId,
    display_id: row.display_id,
    load_id: row.load_id,
    unit_id: unit,
    trailer_id: trailer,
    changed,
    authorization: input.authorization,
  });
  return { advance_id: input.advanceId, display_id: row.display_id, unit_id: unit, trailer_id: trailer, changed };
}
