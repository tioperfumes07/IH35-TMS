// LEAD 443.192 (12:35Z) — "The P-0070 cancel (443.167-R2) left 10 settlement lines active and no void audit: fix through
// executeVoidCancel semantics — lines voided with the settlement, audit row written; read-back."
//
// USMCA driver settlements header-cancelled "443.167 regroup" (2026-10-16, a write outside the engine: status/voided_at only)
// kept live settlement_lines, an open driver bill still linked to a dead settlement, and no void audit. The engine fix
// (void-cancel-executors.ts) makes executeVoidCancel('driver_settlement') finish a header that is already cancelled: the GL
// reversal (no-op when nothing posted; refuses live GL by name), the line + child cascade, the dead-link release of open
// driver bills, and the driver_finance.driver_settlement.voided audit. This runner calls THAT engine for each settlement in
// the set — no hand-written UPDATE, never DELETE. The header void stamp stands (not re-written).
// Refuses unless every target is header-cancelled, carries no live driver_settlement GL, and the engine reports ok/already_done.
// Read-back: 0 live lines, 0 open bills linked, one void audit per settlement, trial balance unchanged and 0.
//   default: dry run in one transaction, ROLLED BACK · --fork-commit (assertNotProduction) · --apply --auth LEAD-ORDER-443.192
import pg from "pg";
import { assertIsIntendedProduction, assertNotProduction } from "../lib/assert-not-production.mjs";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const REASON = "443.192: complete the 443.167 regroup void through executeVoidCancel (lines voided with the settlement, audit)";
const APPLY = process.argv.includes("--apply");
const FORK = process.argv.includes("--fork-commit");
if (APPLY) {
  const i = process.argv.indexOf("--auth");
  if ((process.argv[i + 1] ?? "") !== "LEAD-ORDER-443.192") throw new Error("--apply requires --auth LEAD-ORDER-443.192");
  // verify-owner-authorization: Lead ROUND 443.192 (12:35Z) "The P-0070 cancel (443.167-R2) left 10 settlement lines active
  // and no void audit: fix through executeVoidCancel semantics — lines voided with the settlement, audit row written; read-back."
}
if (APPLY && FORK) throw new Error("--apply and --fork-commit are exclusive");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");

const guard = new pg.Client({ connectionString: process.env.DATABASE_URL });
await guard.connect();
try {
  if (APPLY) await assertIsIntendedProduction(guard, { label: "443.192 P-0070 void lines" });
  else if (FORK) await assertNotProduction(guard, { label: "443.192 P-0070 void lines (fork)" });
} finally {
  await guard.end();
}

const { withLuciaBypass } = await import("../../apps/backend/src/auth/db.ts");
const { executeVoidCancel } = await import("../../apps/backend/src/governance/void-cancel-executors.ts");

type C = { query: <T = any>(sql: string, v?: unknown[]) => Promise<{ rows: T[] }> };
class DryRunRollback extends Error {}

// The set: the USMCA settlements whose header carries the 443.167 regroup void (P-0070 "regrouped into settlement …" and
// the "443.167 regroup" batch). Selected by the void reason the cancel itself wrote — evidence on the row.
const TARGETS_SQL = `
  SELECT s.id::text, s.display_id, s.status
    FROM driver_finance.driver_settlements s
   WHERE s.operating_company_id = $1::uuid
     AND s.voided_at IS NOT NULL
     AND (s.void_reason ILIKE '%443.167 regroup%' OR s.void_reason ILIKE 'regrouped into settlement%')
   ORDER BY s.display_id`;

const counts = async (c: C, ids: string[]) =>
  (
    await c.query(
      `SELECT
         (SELECT count(*)::int FROM driver_finance.settlement_lines l
           WHERE l.settlement_id = ANY($1::uuid[]) AND (l.is_active IS DISTINCT FROM false OR l.voided_at IS NULL)) AS live_lines,
         (SELECT count(*)::int FROM driver_finance.driver_bills b
           WHERE b.settled_in_settlement_id = ANY($1::uuid[]) AND b.voided_at IS NULL AND b.status = 'open') AS open_bills_linked,
         (SELECT count(*)::int FROM driver_finance.driver_bills b
           WHERE b.settled_in_settlement_id = ANY($1::uuid[]) AND b.voided_at IS NULL AND b.status <> 'open') AS nonopen_bills_linked,
         (SELECT count(*)::int FROM driver_finance.driver_settlement_deductions d
           WHERE d.applied_to_settlement_id = ANY($1::uuid[]) AND d.voided_at IS NULL) AS live_deductions,
         (SELECT count(*)::int FROM accounting.journal_entry_postings p
           WHERE p.operating_company_id = $2::uuid AND p.source_transaction_type = 'driver_settlement'
             AND p.source_transaction_id = ANY($3::text[]) AND p.reversed_by_line_id IS NULL AND p.reversal_of_line_id IS NULL) AS live_gl,
         (SELECT count(DISTINCT e.payload->>'resource_id')::int FROM audit.audit_events e
           WHERE e.event_class = 'driver_finance.driver_settlement.voided' AND e.payload->>'resource_id' = ANY($3::text[])) AS audited`,
      [ids, USMCA, ids]
    )
  ).rows[0];

const tb = async (c: C) =>
  (
    await c.query<{ net: string }>(
      `SELECT COALESCE(sum(CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE -amount_cents END),0)::text net
         FROM accounting.journal_entry_postings WHERE operating_company_id=$1::uuid`,
      [USMCA]
    )
  ).rows[0]!.net;

let ok = false;
try {
  await withLuciaBypass(
    async (client) => {
      const c = client as unknown as C;
      await c.query("SELECT set_config('app.operating_company_id',$1,true)", [USMCA]);
      const tbBefore = await tb(c);
      const targets = (await c.query<{ id: string; display_id: string; status: string }>(TARGETS_SQL, [USMCA])).rows;
      if (!targets.length) throw new Error("REFUSE: no 443.167 regroup settlements found on this database");
      const notCancelled = targets.filter((t) => t.status !== "cancelled");
      if (notCancelled.length) throw new Error(`REFUSE: ${notCancelled.length} target(s) voided but not status 'cancelled'`);
      const ids = targets.map((t) => t.id);
      const before = await counts(c, ids);
      console.log(`targets ${targets.length} · before ${JSON.stringify(before)} · TB ${tbBefore}`);
      if (before.live_gl !== 0) throw new Error(`REFUSE: ${before.live_gl} live driver_settlement posting(s) under the set`);

      const outcomes: Record<string, number> = {};
      for (const t of targets) {
        const res = await executeVoidCancel("driver_settlement", {
          client: c as never,
          operatingCompanyId: USMCA,
          entityId: t.id,
          action: "void",
          userId: OWNER,
          reason: REASON,
        });
        outcomes[res.kind] = (outcomes[res.kind] ?? 0) + 1;
        if (res.kind !== "ok" && res.kind !== "already_done") throw new Error(`NOT VERIFIED ${t.display_id}: engine returned ${res.kind}`);
        console.log(`  ${t.display_id} → ${res.kind}`);
      }

      const after = await counts(c, ids);
      const tbAfter = await tb(c);
      console.log(`outcomes ${JSON.stringify(outcomes)} · after ${JSON.stringify(after)} · TB ${tbAfter}`);
      if (after.live_lines !== 0) throw new Error(`NOT VERIFIED: ${after.live_lines} live line(s) remain`);
      if (after.open_bills_linked !== 0) throw new Error(`NOT VERIFIED: ${after.open_bills_linked} open bill(s) still linked`);
      if (after.live_deductions !== 0) throw new Error(`NOT VERIFIED: ${after.live_deductions} live deduction(s) remain`);
      if (after.audited !== targets.length) throw new Error(`NOT VERIFIED: void audit on ${after.audited} of ${targets.length}`);
      if (tbAfter !== tbBefore || Number(tbAfter) !== 0) throw new Error(`NOT VERIFIED: trial balance ${tbBefore} → ${tbAfter}`);
      if (after.nonopen_bills_linked) console.log(`note: ${after.nonopen_bills_linked} non-open bill(s) linked (never touched here)`);

      if (!APPLY && !FORK) throw new DryRunRollback("dry run");
    },
    { actorUserId: OWNER }
  );
  console.log("COMMITTED");
  ok = true;
} catch (e) {
  if (e instanceof DryRunRollback) {
    console.log("DRY RUN — ROLLED BACK. Pass --fork-commit (fork) or --apply --auth LEAD-ORDER-443.192.");
    ok = true;
  } else {
    console.error(e);
  }
} finally {
  setTimeout(() => process.exit(ok ? 0 : 1), 500);
}
