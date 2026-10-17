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
//
// LEAD 443.192 (13:25Z item 3) — re-run: the cascade now also releases unpaid reimbursements settled against the dead
// settlement (status 'settled' -> 'pending', applied_to_settlement_id + settlement_line_id NULL; paid / void never
// touched). Measured: 4 such rows under this set (P-0090 x3, P-0091 x1). A settlement already audited by the first run
// returns 'ok' (not already_done) when it releases a reimbursement, and writes a new void audit naming the released ids.
// Extra read-back: 0 reimbursements settled against the set, 0 paid reimbursements under it, one new audit naming each
// released id, and the count of reimbursements still settled against ANY cancelled/voided settlement outside the set
// Follow-up: the set also takes, by evidence, every cancelled/voided settlement still holding a live line / open bill /
// unpaid reimbursement (P-0085, P-0092); final check is 0 reimbursements + 0 open bills on ANY cancelled/voided USMCA
// settlement. Refuses if any live deduction or paid reimbursement sits under the set.
//   default: dry run in one transaction, ROLLED BACK · --fork-commit (assertNotProduction) · --apply --auth LEAD-ORDER-443.192
import pg from "pg";
import { assertIsIntendedProduction, assertNotProduction } from "../lib/assert-not-production.mjs";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const REASON =
  "443.192: complete the cancelled settlement void through executeVoidCancel (lines voided, open bills + unpaid reimbursements released, audit)";
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
// LEAD 443.192 (13:25Z follow-up): PLUS every USMCA settlement whose header is cancelled/voided but which still holds
// something live — a live settlement line, an OPEN driver bill, or an unpaid reimbursement — selected by that EVIDENCE,
// never by reason text (measured: P-0085 + P-0092, cancelled by Settlement Creator "Edit = void and repost" before
// reverseSettlementForVoid ran the shared cascade). The engine finishes them exactly as it finished the regroup set.
const TARGETS_SQL = `
  SELECT s.id::text, s.display_id, s.status
    FROM driver_finance.driver_settlements s
   WHERE s.operating_company_id = $1::uuid
     AND (
           (s.voided_at IS NOT NULL
            AND (s.void_reason ILIKE '%443.167 regroup%' OR s.void_reason ILIKE 'regrouped into settlement%'))
        OR ((s.status = 'cancelled' OR s.voided_at IS NOT NULL)
            AND (EXISTS (SELECT 1 FROM driver_finance.settlement_lines l
                          WHERE l.settlement_id = s.id AND l.operating_company_id = s.operating_company_id
                            AND (l.is_active IS DISTINCT FROM false OR l.voided_at IS NULL))
                 OR EXISTS (SELECT 1 FROM driver_finance.driver_bills b
                             WHERE b.settled_in_settlement_id = s.id AND b.operating_company_id = s.operating_company_id
                               AND b.status = 'open' AND b.voided_at IS NULL)
                 OR EXISTS (SELECT 1 FROM driver_finance.driver_reimbursements r
                             WHERE r.applied_to_settlement_id = s.id AND r.operating_company_id = s.operating_company_id
                               AND r.status IN ('settled', 'pending') AND r.paid_at IS NULL AND r.voided_at IS NULL)))
         )
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
           WHERE e.event_class = 'driver_finance.driver_settlement.voided' AND e.payload->>'resource_id' = ANY($3::text[])) AS audited,
         (SELECT count(*)::int FROM driver_finance.driver_reimbursements r
           WHERE r.operating_company_id = $2::uuid AND r.voided_at IS NULL AND r.status <> 'void'
             AND (r.applied_to_settlement_id = ANY($1::uuid[])
                  OR r.settlement_line_id IN (SELECT l.id FROM driver_finance.settlement_lines l WHERE l.settlement_id = ANY($1::uuid[])))) AS reimb_linked,
         (SELECT count(*)::int FROM driver_finance.driver_reimbursements r
           WHERE r.operating_company_id = $2::uuid AND r.applied_to_settlement_id = ANY($1::uuid[])
             AND (r.status = 'paid' OR r.paid_at IS NOT NULL)) AS reimb_paid_linked,
         (SELECT count(*)::int FROM driver_finance.driver_reimbursements r
            JOIN driver_finance.driver_settlements s2 ON s2.id = r.applied_to_settlement_id AND s2.operating_company_id = r.operating_company_id
           WHERE r.operating_company_id = $2::uuid AND r.voided_at IS NULL AND r.status <> 'void'
             AND (s2.status = 'cancelled' OR s2.voided_at IS NOT NULL)) AS reimb_dead_any,
         (SELECT count(*)::int FROM driver_finance.driver_bills b
            JOIN driver_finance.driver_settlements s2 ON s2.id = b.settled_in_settlement_id AND s2.operating_company_id = b.operating_company_id
           WHERE b.operating_company_id = $2::uuid AND b.voided_at IS NULL AND b.status = 'open'
             AND (s2.status = 'cancelled' OR s2.voided_at IS NOT NULL)) AS open_bills_dead_any`,
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
      if (!targets.length) throw new Error("REFUSE: no 443.167 regroup / still-linked cancelled settlements found on this database");
      const notCancelled = targets.filter((t) => t.status !== "cancelled");
      if (notCancelled.length) throw new Error(`REFUSE: ${notCancelled.length} target(s) voided but not status 'cancelled'`);
      const ids = targets.map((t) => t.id);
      const before = await counts(c, ids);
      console.log(`targets ${targets.length} · before ${JSON.stringify(before)} · TB ${tbBefore}`);
      if (before.live_gl !== 0) throw new Error(`REFUSE: ${before.live_gl} live driver_settlement posting(s) under the set`);
      // A paid reimbursement is money already out — never released here; refuse rather than leave it half-handled.
      // executeVoidCancel's cascade raw-stamps live deductions (cascadeVoidChildren); none may be under the set — a
      // deduction on a cancelled settlement goes only through the owner-ruled deduction engine.
      if (before.live_deductions !== 0) throw new Error(`REFUSE: ${before.live_deductions} live deduction(s) under the set`);
      if (before.reimb_paid_linked !== 0) throw new Error(`REFUSE: ${before.reimb_paid_linked} PAID reimbursement(s) linked to the set`);
      const reimbBefore = (
        await c.query<{ id: string }>(
          `SELECT r.id::text FROM driver_finance.driver_reimbursements r
            WHERE r.operating_company_id = $2::uuid AND r.voided_at IS NULL AND r.status <> 'void'
              AND (r.applied_to_settlement_id = ANY($1::uuid[])
                   OR r.settlement_line_id IN (SELECT l.id FROM driver_finance.settlement_lines l WHERE l.settlement_id = ANY($1::uuid[])))`,
          [ids, USMCA]
        )
      ).rows.map((r) => r.id);

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
      if (after.reimb_linked !== 0) throw new Error(`NOT VERIFIED: ${after.reimb_linked} reimbursement(s) still settled against the set`);
      if (reimbBefore.length) {
        const named = (
          await c.query<{ id: string }>(
            `SELECT DISTINCT x.id FROM audit.audit_events e
               CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(e.payload->'reimbursements_released', '[]'::jsonb)) AS x(id)
              WHERE e.event_class = 'driver_finance.driver_settlement.voided'
                AND e.payload->>'resource_id' = ANY($1::text[])
                AND e.created_at >= now()  -- this transaction's audits only (now() = transaction start)`,
            [ids]
          )
        ).rows.map((r) => r.id);
        const unnamed = reimbBefore.filter((id) => !named.includes(id));
        if (unnamed.length) throw new Error(`NOT VERIFIED: ${unnamed.length} released reimbursement(s) not named in a new void audit`);
        const back = (
          await c.query<{ n: number }>(
            `SELECT count(*)::int AS n FROM driver_finance.driver_reimbursements
              WHERE id = ANY($1::uuid[]) AND status = 'pending' AND applied_to_settlement_id IS NULL AND settlement_line_id IS NULL`,
            [reimbBefore]
          )
        ).rows[0]!.n;
        if (back !== reimbBefore.length) throw new Error(`NOT VERIFIED: ${reimbBefore.length - back} released reimbursement(s) not back to pending/unlinked`);
        console.log(`reimbursements released ${reimbBefore.length} · named in new void audit ${named.length}`);
      }
      // FINAL (Lead 13:25Z follow-up): nothing on ANY cancelled/voided USMCA settlement — not only this set.
      if (after.reimb_dead_any !== 0)
        throw new Error(`NOT VERIFIED: ${after.reimb_dead_any} reimbursement(s) still settled against a cancelled/voided USMCA settlement`);
      if (after.open_bills_dead_any !== 0)
        throw new Error(`NOT VERIFIED: ${after.open_bills_dead_any} open driver bill(s) still linked to a cancelled/voided USMCA settlement`);
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
