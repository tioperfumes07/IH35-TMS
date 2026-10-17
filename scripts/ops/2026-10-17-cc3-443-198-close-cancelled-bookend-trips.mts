// LEAD 443.198 — required-live-load-guard red: guard 3069 "7 cancelled/voided settlement(s) are still reusable (ACCT-F347)".
//
// Measured on prod 2026-10-17 (read-only): 7 USMCA load_bookended settlements cancelled + voided on 2026-10-16 with
// trip_closed_at still NULL and a live anchor load — P-0085 / P-0092 (Settlement Creator "Edit = void and repost") and
// P-0093..P-0097 ("443.167 regroup" header cancel). audit.row_changes: no header write since 2026-10-16, so the 443.192 /
// 443.193 cascade runs did not cause it — no void path ever stamped trip_closed_at (the ACCT-F347 root cause, #5812, which
// fixed only the readers and hand-stamped 4 rows). The engine fix (this PR) makes the ONE void cascade close a
// load_bookended trip (closeVoidedSettlementTripInClientTx: trip_closed_at = COALESCE(voided_at, reversed_at, now()) where
// NULL — lifecycle marker only). This runner calls executeVoidCancel('driver_settlement') — the engine — for each target;
// its already-cancelled branch runs the cascade (which now closes the trip) and writes the void audit naming trip_closed.
// No hand-written UPDATE, never DELETE, never a money column.
//
// Targets are selected by EVIDENCE — guard 3069's own predicate, scoped to USMCA — never by display id or reason text.
// Refuses unless every target is header-cancelled with nothing else left to cascade (0 live lines, 0 open bills, 0 unpaid
// reimbursements, 0 live deductions, 0 live driver_settlement GL), so the ONLY write is the trip close.
// Read-back: guard predicate 0 for USMCA; trip_closed_at = the row's own voided_at; gross / deductions / reimbursements /
// net / status byte-identical; one new void audit per target with trip_closed = true; trial balance unchanged and 0.
//   default: dry run in one transaction, ROLLED BACK · --fork-commit (assertNotProduction) · --apply --auth LEAD-ORDER-443.198
import pg from "pg";
import { assertIsIntendedProduction, assertNotProduction } from "../lib/assert-not-production.mjs";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const REASON = "443.198: close the trip of a cancelled load_bookended settlement through executeVoidCancel (ACCT-F347 / guard 3069)";
const APPLY = process.argv.includes("--apply");
const FORK = process.argv.includes("--fork-commit");
if (APPLY) {
  const i = process.argv.indexOf("--auth");
  if ((process.argv[i + 1] ?? "") !== "LEAD-ORDER-443.198") throw new Error("--apply requires --auth LEAD-ORDER-443.198");
  // verify-owner-authorization: Lead ROUND 443.198 — required-live-load-guard red on 3069 (7 cancelled settlements
  // still reusable); engine fix + engine-only data repair, TB 0.
}
if (APPLY && FORK) throw new Error("--apply and --fork-commit are exclusive");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");

const guard = new pg.Client({ connectionString: process.env.DATABASE_URL });
await guard.connect();
try {
  if (APPLY) await assertIsIntendedProduction(guard, { label: "443.198 close cancelled bookend trips" });
  else if (FORK) await assertNotProduction(guard, { label: "443.198 close cancelled bookend trips (fork)" });
} finally {
  await guard.end();
}

const { withLuciaBypass } = await import("../../apps/backend/src/auth/db.ts");
const { executeVoidCancel } = await import("../../apps/backend/src/governance/void-cancel-executors.ts");

type C = { query: <T = any>(sql: string, v?: unknown[]) => Promise<{ rows: T[] }> };
class DryRunRollback extends Error {}

// Guard 3069's live predicate, verbatim, scoped to USMCA.
const TARGETS_SQL = `
  SELECT s.id::text, s.display_id, s.status, s.voided_at::text AS voided_at,
         s.gross_pay::text, s.deductions_total::text, s.reimbursements_total::text, s.net_pay::text
    FROM driver_finance.driver_settlements s
    JOIN mdata.loads fl
      ON fl.id = s.first_load_id
     AND fl.operating_company_id = s.operating_company_id
     AND fl.soft_deleted_at IS NULL
   WHERE s.operating_company_id = $1::uuid
     AND s.settlement_model = 'load_bookended'
     AND s.trip_closed_at IS NULL
     AND s.first_load_id IS NOT NULL
     AND (s.status = 'cancelled' OR s.voided_at IS NOT NULL)
   ORDER BY s.display_id`;

const residue = async (c: C, ids: string[]) =>
  (
    await c.query(
      `SELECT
         (SELECT count(*)::int FROM driver_finance.settlement_lines l
           WHERE l.settlement_id = ANY($1::uuid[]) AND (l.is_active IS DISTINCT FROM false OR l.voided_at IS NULL)) AS live_lines,
         (SELECT count(*)::int FROM driver_finance.driver_bills b
           WHERE b.settled_in_settlement_id = ANY($1::uuid[]) AND b.voided_at IS NULL AND b.status = 'open') AS open_bills_linked,
         (SELECT count(*)::int FROM driver_finance.driver_reimbursements r
           WHERE r.operating_company_id = $2::uuid AND r.voided_at IS NULL AND r.status <> 'void'
             AND r.applied_to_settlement_id = ANY($1::uuid[])) AS reimb_linked,
         (SELECT count(*)::int FROM driver_finance.driver_settlement_deductions d
           WHERE d.applied_to_settlement_id = ANY($1::uuid[]) AND d.voided_at IS NULL) AS live_deductions,
         (SELECT count(*)::int FROM accounting.journal_entry_postings p
           WHERE p.operating_company_id = $2::uuid AND p.source_transaction_type = 'driver_settlement'
             AND p.source_transaction_id = ANY($3::text[]) AND p.reversed_by_line_id IS NULL AND p.reversal_of_line_id IS NULL) AS live_gl`,
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
      type T = { id: string; display_id: string; status: string; voided_at: string | null; gross_pay: string; deductions_total: string; reimbursements_total: string; net_pay: string };
      const targets = (await c.query<T>(TARGETS_SQL, [USMCA])).rows;
      if (!targets.length) throw new Error("REFUSE: no cancelled load_bookended settlement with an open trip on this database");
      const notCancelled = targets.filter((t) => t.status !== "cancelled" || !t.voided_at);
      if (notCancelled.length) throw new Error(`REFUSE: ${notCancelled.length} target(s) not fully cancelled + voided`);
      const ids = targets.map((t) => t.id);
      const before = await residue(c, ids);
      console.log(`targets ${targets.length} (${targets.map((t) => t.display_id).join(", ")}) · residue ${JSON.stringify(before)} · TB ${tbBefore}`);
      // The trip close must be the ONLY write: anything else still under the set belongs to the 443.192 / 443.193 runs.
      for (const [k, v] of Object.entries(before)) if (v !== 0) throw new Error(`REFUSE: ${k} = ${v} under the set (not trip-close-only)`);

      for (const t of targets) {
        const res = await executeVoidCancel("driver_settlement", {
          client: c as never,
          operatingCompanyId: USMCA,
          entityId: t.id,
          action: "void",
          userId: OWNER,
          reason: REASON,
        });
        if (res.kind !== "ok") throw new Error(`NOT VERIFIED ${t.display_id}: engine returned ${res.kind}`);
        console.log(`  ${t.display_id} → ${res.kind}`);
      }

      const left = (await c.query(TARGETS_SQL, [USMCA])).rows.length;
      if (left !== 0) throw new Error(`NOT VERIFIED: guard 3069 predicate still names ${left} USMCA settlement(s)`);
      const after = (
        await c.query<T & { trip_closed_at: string | null }>(
          `SELECT id::text, display_id, status, voided_at::text AS voided_at, trip_closed_at::text AS trip_closed_at,
                  gross_pay::text, deductions_total::text, reimbursements_total::text, net_pay::text
             FROM driver_finance.driver_settlements WHERE id = ANY($1::uuid[])`,
          [ids]
        )
      ).rows;
      for (const t of targets) {
        const a = after.find((r) => r.id === t.id)!;
        for (const k of ["status", "voided_at", "gross_pay", "deductions_total", "reimbursements_total", "net_pay"] as const)
          if (a[k] !== t[k]) throw new Error(`NOT VERIFIED ${t.display_id}: ${k} changed ${t[k]} → ${a[k]}`);
        if (a.trip_closed_at !== t.voided_at) throw new Error(`NOT VERIFIED ${t.display_id}: trip_closed_at ${a.trip_closed_at} ≠ voided_at ${t.voided_at}`);
      }
      const audited = (
        await c.query<{ n: number }>(
          `SELECT count(DISTINCT e.payload->>'resource_id')::int AS n FROM audit.audit_events e
            WHERE e.event_class = 'driver_finance.driver_settlement.voided'
              AND e.payload->>'resource_id' = ANY($1::text[])
              AND (e.payload->>'trip_closed')::boolean IS TRUE
              AND e.created_at >= now()  -- this transaction's audits only (now() = transaction start)`,
          [ids]
        )
      ).rows[0]!.n;
      if (audited !== targets.length) throw new Error(`NOT VERIFIED: trip_closed void audit on ${audited} of ${targets.length}`);
      const residueAfter = await residue(c, ids);
      for (const [k, v] of Object.entries(residueAfter)) if (v !== 0) throw new Error(`NOT VERIFIED: ${k} = ${v} after`);
      const tbAfter = await tb(c);
      if (tbAfter !== tbBefore || Number(tbAfter) !== 0) throw new Error(`NOT VERIFIED: trial balance ${tbBefore} → ${tbAfter}`);
      console.log(`trips closed ${targets.length} · audited ${audited} · money columns unchanged · TB ${tbAfter}`);

      if (!APPLY && !FORK) throw new DryRunRollback("dry run");
    },
    { actorUserId: OWNER }
  );
  console.log("COMMITTED");
  ok = true;
} catch (e) {
  if (e instanceof DryRunRollback) {
    console.log("DRY RUN — ROLLED BACK. Pass --fork-commit (fork) or --apply --auth LEAD-ORDER-443.198.");
    ok = true;
  } else {
    console.error(e);
  }
} finally {
  setTimeout(() => process.exit(ok ? 0 : 1), 500);
}
