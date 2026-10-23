/**
 * settlement-boundaries.service.ts — LEAD 443.260.2 / 443.260.4 (CC-2): THE one writer of a settlement header's load
 * boundaries (driver_finance.driver_settlements first_load_id / last_load_id and their load numbers).
 *
 * The boundaries are DERIVED, never accumulated, from the settlement's OWN lines: the loads its active lines cover
 * (through the canonical driver-bill path first, ACCT-F290), ordered by each load's earliest stop time (actual arrival,
 * else appointment, else scheduled; the load's creation only when it has no stop). First = earliest, last = latest.
 * A settlement with no load-bearing line yet (a just-linked pre-settlement) derives from the loads linked to it
 * (mdata.loads.presettlement_link_id). With neither, the header is left exactly as it is — nothing is invented.
 *
 * Why (measured on prod 10-23): three writers kept the boundaries by increments — the shared rollup only filled NULLs,
 * the load reassignment NULLed a boundary that named the moved load, and the pre-settlement link set
 * first_load_id = COALESCE(first_load_id, <the JOINING load>) and last_load_id = <the joining load>. 5 settlements read
 * first_load_id = last_load_id = one load while their lines name 2–3 loads (the numbers disagreed with the ids), so
 * accounting.posting_source_load_id named one load for every leg of a multi-load settlement.
 *
 * Idempotent; writes only when a value changes, with one audit row. Metadata only — no amount, status, line or posting.
 */
import { canonicalNotCancelledLoadClause } from "../dispatch/canonical-active-load-set.js";
import { notVoided } from "../accounting/live-document-predicates.sql.js";

type QueryClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }>;
};

export type SettlementBoundaries = {
  settlement_id: string;
  before: { first_load_id: string | null; last_load_id: string | null; first_load_number: string | null; last_load_number: string | null };
  after: { first_load_id: string | null; last_load_id: string | null; first_load_number: string | null; last_load_number: string | null };
  changed: boolean;
  loads: number;
};

export const SETTLEMENT_LOADS_BY_STOP_TIME_SQL = `
  WITH line_loads AS (
    SELECT DISTINCT COALESCE(db.load_id, sl.load_id) AS load_id
      FROM driver_finance.settlement_lines sl
      LEFT JOIN driver_finance.driver_bills db ON db.id = sl.source_driver_bill_id AND db.operating_company_id = $2::uuid
     WHERE sl.settlement_id = $1::uuid AND sl.operating_company_id = $2::uuid
       AND sl.is_active = true AND ${notVoided("sl")} AND COALESCE(db.load_id, sl.load_id) IS NOT NULL
  ),
  linked_loads AS (
    SELECT l.id AS load_id FROM mdata.loads l
     WHERE l.presettlement_link_id = $1::uuid AND l.operating_company_id = $2::uuid
       AND l.soft_deleted_at IS NULL AND ${notVoided("l")} AND ${canonicalNotCancelledLoadClause("l")}
       AND NOT EXISTS (SELECT 1 FROM line_loads)
  ),
  loads AS (SELECT load_id FROM line_loads UNION SELECT load_id FROM linked_loads)
  SELECT l.id::text AS load_id, l.load_number::text AS load_number,
         COALESCE((SELECT min(COALESCE(s.actual_arrival_at, s.appointment_start_at, s.scheduled_arrival_at))
                     FROM mdata.load_stops s WHERE s.load_id = l.id AND s.soft_deleted_at IS NULL), l.created_at) AS at
    FROM loads x JOIN mdata.loads l ON l.id = x.load_id AND l.operating_company_id = $2::uuid
   ORDER BY at, l.load_number, l.id`;

export async function rederiveSettlementBoundariesInClientTx(
  client: QueryClient,
  input: { operatingCompanyId: string; settlementId: string; actorUserId: string | null; reason: string; clearWhenNoLoads?: boolean },
  audit?: (eventClass: string, payload: Record<string, unknown>) => Promise<void>,
): Promise<SettlementBoundaries> {
  const head = (
    await client.query<{ first_load_id: string | null; last_load_id: string | null; first_load_number: string | null; last_load_number: string | null }>(
      `SELECT first_load_id::text, last_load_id::text, first_load_number::text, last_load_number::text
         FROM driver_finance.driver_settlements WHERE id = $1::uuid AND operating_company_id = $2::uuid FOR UPDATE`,
      [input.settlementId, input.operatingCompanyId],
    )
  ).rows[0];
  if (!head) throw new Error(`settlement_not_found:${input.settlementId}`);
  const loads = (await client.query<{ load_id: string; load_number: string }>(SETTLEMENT_LOADS_BY_STOP_TIME_SQL, [input.settlementId, input.operatingCompanyId])).rows;
  // No load-bearing line and no linked load: leave the header as it is — unless the caller just moved the
  // settlement's last load away (the reassignment), where a boundary naming a load it no longer covers is false.
  if (!loads.length && !input.clearWhenNoLoads) return { settlement_id: input.settlementId, before: head, after: head, changed: false, loads: 0 };
  const first = loads[0] ?? null;
  const last = loads[loads.length - 1] ?? null;
  const after = {
    first_load_id: first?.load_id ?? null, last_load_id: last?.load_id ?? null,
    first_load_number: first?.load_number ?? null, last_load_number: last?.load_number ?? null,
  };
  const changed = after.first_load_id !== head.first_load_id || after.last_load_id !== head.last_load_id
    || after.first_load_number !== head.first_load_number || after.last_load_number !== head.last_load_number;
  if (changed) {
    await client.query(
      `UPDATE driver_finance.driver_settlements
          SET first_load_id = $3::uuid, last_load_id = $4::uuid, first_load_number = $5, last_load_number = $6, updated_at = now()
        WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
      [input.settlementId, input.operatingCompanyId, after.first_load_id, after.last_load_id, after.first_load_number, after.last_load_number],
    );
    if (audit) {
      await audit("driver_finance.presettlement.boundaries_rederived", {
        resource_id: input.settlementId, resource_type: "driver_finance.driver_settlements", operating_company_id: input.operatingCompanyId,
        before: head, after, loads: loads.length, reason: input.reason,
      });
    }
  }
  return { settlement_id: input.settlementId, before: head, after, changed, loads: loads.length };
}
