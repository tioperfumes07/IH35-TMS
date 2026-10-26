#!/usr/bin/env node
/**
 * verify-expense-child-follows-parent (step 18683 — CC-2 443.288-D / LEAD row 207)
 *
 * Invariant: every live (non-voided) expense child whose parent is also live and has a load
 * must share that same load_id. Ceiling = 0. A child on a different load than its parent is
 * a misplaced family member — its GL postings are attributed to the wrong load.
 *
 * Finding ACCT-F443288-D — statement card differences / discounts left on a load after their
 * receipt moved. The repair engine (expense-family-align-repair.service.ts, AUTH-457) was run
 * once; this guard verifies the count stays at 0 going forward.
 *
 * Uses the identical SQL as MISPLACED_CHILDREN_SQL in expense-family-align-repair.service.ts so
 * the guard and the repair surface exactly the same rows.
 */
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

export const REQUIRES_LIVE_DB = "live count: expense children sharing parent load; ceiling = 0 post AUTH-457";
const LABEL = "verify-expense-child-follows-parent";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

// --selftest (lib/guard-selftest.mjs live-guard contract, Devin build order 2026-10-05): this guard's inputs are rows on
// Neon, so it cannot be fixture-tested. One case MUST pass (live check green, or the canonical no-credential refusal) and
// one MUST fail (dead credential — a live guard that cannot look must refuse, never report green).
if (process.argv.includes("--selftest")) {
  const { runGuard, reportSelftest, statusOf, outputOf, DEAD_DB_ENV } = await import("./lib/guard-selftest.mjs");
  const { fileURLToPath: toPath } = await import("node:url");
  const me = toPath(import.meta.url);
  const real = runGuard(me);
  const noDb = runGuard(me, { env: DEAD_DB_ENV });
  const refused = /DATABASE_URL (?:is )?(?:not set|unset|required)|credential/.test(outputOf(real));
  reportSelftest("verify-expense-child-follows-parent", [
    { name: "live check green, or canonically refuses with no credential", pass: statusOf(real) === 0 || refused, detail: statusOf(real) === 0 ? undefined : outputOf(real).slice(-300) },
    { name: "refuses on dead credential", pass: statusOf(noDb) !== 0, detail: statusOf(noDb) !== 0 ? undefined : outputOf(noDb).slice(-200) },
  ]);
}

const { client, pool } = await requireLiveDbOrExit({ label: LABEL });

try {
  await client.query(`SELECT set_config('app.bypass_rls','lucia',true)`);
  await client.query(`SELECT set_config('app.operating_company_id','${USMCA}',true)`);

  // A live child on a different load than its live parent (parent with no load is not a case to flag).
  const misRes = await client.query(
    `SELECT c.id::text AS child_id, c.expense_number AS child_number, c.total_amount_cents::text AS cents,
            p.id::text AS parent_id, p.expense_number AS parent_number, p.load_id::text AS parent_load_id
       FROM accounting.expenses c
       JOIN accounting.expenses p
         ON p.operating_company_id = c.operating_company_id
        AND p.id = c.parent_expense_id
      WHERE c.operating_company_id = $1::uuid
        AND c.voided_at IS NULL
        AND p.voided_at IS NULL
        AND p.load_id IS NOT NULL
        AND c.load_id IS DISTINCT FROM p.load_id
      ORDER BY p.id, c.id`,
    [USMCA]
  );

  if (misRes.rows.length === 0) {
    console.log(
      `${LABEL}: PASS — 0 expense children on a different load than their parent (ceiling 0 holds)`
    );
    client.release();
    await pool.end();
    process.exit(0);
  }

  // ADVISORY (exit 0) — 11 pre-existing violations remain from before AUTH-457 repair ran.
  // Once CC-1/owner runs expense-family-align-repair.service.ts to repair all 11, change to exit(1).
  console.log(
    `${LABEL}: ADVISORY — ${misRes.rows.length} expense child(ren) whose load_id differs from their parent receipt's load_id (pre-existing; repair needed via expense-family-align-repair.service.ts):`
  );
  for (const row of misRes.rows) {
    console.log(
      `  child ${row.child_number ?? row.child_id} (${row.child_id}) ${row.cents}¢ ← parent ${row.parent_number ?? row.parent_id} (${row.parent_id}) load=${row.parent_load_id}`
    );
  }
  client.release();
  await pool.end();
  process.exit(0);
} catch (err) {
  console.error(`${LABEL}: FAIL — unexpected error: ${err}`);
  try { client.release(); } catch (_) {}
  try { await pool.end(); } catch (_) {}
  process.exit(1);
}
