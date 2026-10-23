/**
 * settlement-header-repair.service.ts — LEAD 443.260.2 / 443.260.4 / 443.260.5 (CC-2, AUTH-454).
 * OWNER, verbatim 10-22 8:25 PM CT: "REMEMBER FIND THE ROOTCAUSES AND CREATE PERMANENT SOLUTION AND FIX. ALWAYS FIX
 * ENGINES, NEVER DEFER." and 9:55 PM CT: "fix".
 *
 * Target (measured on prod 10-23, exactly 5 — P-0105, P-0107, P-0108, P-0109 closed + P-0115 open): a live settlement
 * whose first_load_id = last_load_id while its active lines name 2+ loads — the stale header three incremental writers
 * left behind. Each is re-derived by THE engine (rederiveSettlementBoundariesInClientTx), one audit row each.
 * METADATA ONLY: no amount, status, line, posting or GL row — refuses unless TB and the posting count are unchanged, and
 * unless exactly `expect` settlements match (the 41 ordering-convention differences are a separate AUTH — Lead 443.260.5 (c)).
 * Runs inside the caller's ONE transaction; a dry run rolls back to its savepoint. ONE code path for the owner-only route
 * (POST /api/v1/driver-finance/settlements/header-boundaries-repair) and the ops script.
 */
import { appendCrudAudit } from "../audit/crud-audit.js";
import { notVoided } from "../accounting/live-document-predicates.sql.js";
import { rederiveSettlementBoundariesInClientTx } from "./settlement-boundaries.service.js";

type QueryClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }>;
};

export const SETTLEMENT_HEADER_REPAIR_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80"; // USMCA only (AUTH-454 scope)
const REASON = "LEAD 443.260.4 AUTH-454: header load boundaries re-derived from the settlement's own lines (they named one load for a multi-load settlement)";

export class SettlementHeaderRepairRefused extends Error {}

export const STALE_SETTLEMENT_HEADERS_SQL = `
  SELECT s.id::text, s.display_id, s.status
    FROM driver_finance.driver_settlements s
   WHERE s.operating_company_id = $1::uuid AND ${notVoided("s")} AND s.first_load_id = s.last_load_id
     AND (SELECT count(DISTINCT sl.load_id) FROM driver_finance.settlement_lines sl
           WHERE sl.settlement_id = s.id AND sl.operating_company_id = s.operating_company_id
             AND sl.is_active = true AND ${notVoided("sl")} AND sl.load_id IS NOT NULL) >= 2
   ORDER BY (s.display_id = 'P-0108') DESC, s.display_id`;

export type SettlementHeaderRepairResult = {
  dry_run: boolean; settlements: number; stale_headers_left: number;
  tb_before: { net: string; n: string }; tb_after: { net: string; n: string };
  rows: Array<{ settlement: string; status: string; loads: number; before: string; after: string }>;
};

const tb = async (c: QueryClient, companyId: string) =>
  (await c.query<{ net: string; n: string }>(
    `SELECT COALESCE(sum(CASE WHEN debit_or_credit = 'debit' THEN amount_cents ELSE -amount_cents END), 0)::text AS net, count(*)::text AS n
       FROM accounting.journal_entry_postings WHERE operating_company_id = $1::uuid`, [companyId])).rows[0]!;

export async function repairStaleSettlementHeadersInClientTx(
  c: QueryClient,
  input: { companyId: string; actorUserId: string; dryRun: boolean; expect?: number },
): Promise<SettlementHeaderRepairResult> {
  if (input.companyId !== SETTLEMENT_HEADER_REPAIR_COMPANY_ID) throw new SettlementHeaderRepairRefused("AUTH-454 scope is USMCA only");
  await c.query("SAVEPOINT settlement_header_repair");
  const tbBefore = await tb(c, input.companyId);
  if (tbBefore.net !== "0") throw new SettlementHeaderRepairRefused(`TB ${tbBefore.net} before`);
  const targets = (await c.query<{ id: string; display_id: string; status: string }>(STALE_SETTLEMENT_HEADERS_SQL, [input.companyId])).rows;
  // A rerun after the repair finds 0 and does nothing (idempotent); otherwise exactly `expect` must match.
  if (targets.length && input.expect !== undefined && targets.length !== input.expect) {
    throw new SettlementHeaderRepairRefused(`${targets.length} settlements match, expected ${input.expect} (${targets.map((t) => t.display_id).join(", ")})`);
  }
  const rows: SettlementHeaderRepairResult["rows"] = [];
  for (const t of targets) {
    const r = await rederiveSettlementBoundariesInClientTx(c, {
      operatingCompanyId: input.companyId, settlementId: t.id, actorUserId: input.actorUserId, reason: REASON,
    }, (eventClass, payload) => appendCrudAudit(c as never, input.actorUserId, eventClass, { ...payload, owner_auth_id: "AUTH-454" }, "info", "443.260.4"));
    if (!r.changed || r.after.first_load_id === r.after.last_load_id) {
      throw new SettlementHeaderRepairRefused(`${t.display_id}: the engine did not separate the boundaries`);
    }
    rows.push({ settlement: t.display_id, status: t.status, loads: r.loads,
      before: `${r.before.first_load_number}/${r.before.last_load_number} ids ${r.before.first_load_id}/${r.before.last_load_id}`,
      after: `${r.after.first_load_number}/${r.after.last_load_number} ids ${r.after.first_load_id}/${r.after.last_load_id}` });
  }
  const tbAfter = await tb(c, input.companyId);
  if (tbAfter.net !== "0" || tbAfter.n !== tbBefore.n) {
    throw new SettlementHeaderRepairRefused(`TB ${tbBefore.net}/${tbBefore.n} → ${tbAfter.net}/${tbAfter.n} (metadata only must not move a posting)`);
  }
  const left = (await c.query(STALE_SETTLEMENT_HEADERS_SQL, [input.companyId])).rows.length;
  if (input.dryRun) await c.query("ROLLBACK TO SAVEPOINT settlement_header_repair");
  else await c.query("RELEASE SAVEPOINT settlement_header_repair");
  return { dry_run: input.dryRun, settlements: rows.length, stale_headers_left: input.dryRun ? targets.length : left, tb_before: tbBefore, tb_after: tbAfter, rows };
}
