#!/usr/bin/env node
/** MATRIX-BUILT-OPTIONAL — live-only / invariant ratchet guard; no surface wiring leaf to register. */
// ROUND 326 item 3 (CC-1) — A/P is a real subledger: the ap_control GL balance equals the open bills (amount - paid,
// not voided). USMCA measured 2026-10-02: GL credit $3,542.98 vs open bills $566.35 — variance $2,976.63, exactly the 60
// orphan expense-JE chains the 2026-09-30 purge left in A/P (expense deleted, its JE + void reversal + re-reversal kept).
// Shrink-only against the baseline variance until the orphan-postings scope of the complete-delete engine runs; then 0.
// Live, read-only, FAIL-CLOSED without DATABASE_URL. USMCA (TRANSP / TRK bills are QBO parallel-book clones, not GL-posted).
import { readFileSync } from "node:fs";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

// --selftest (Devin build order 2026-10-05): live-DB guards cannot be fixture-tested — their inputs
// are rows on Neon. One case MUST pass (live check green, or the canonical no-credential refusal
// when nothing resolves locally) and one MUST fail (dead credential — it must refuse, never green).
if (process.argv.includes("--selftest")) { await selftest_verify_ap_control_ties_subledger(); }
async function selftest_verify_ap_control_ties_subledger() {
  const { runGuard, reportSelftest, statusOf, outputOf, DEAD_DB_ENV } = await import("./lib/guard-selftest.mjs");
  const { fileURLToPath } = await import("node:url");
  const me = fileURLToPath(import.meta.url);
  const real = runGuard(me);
  const noDb = runGuard(me, { env: DEAD_DB_ENV });
  const refused = /DATABASE_URL (?:is )?(?:not set|unset|required)|credential/.test(outputOf(real));
  reportSelftest("verify_ap_control_ties_subledger", [
    { name: "live check green, or canonically refuses with no credential", pass: statusOf(real) === 0 || refused, detail: statusOf(real) === 0 ? undefined : outputOf(real).slice(-300) },
    { name: "refuses on dead credential", pass: statusOf(noDb) !== 0, detail: statusOf(noDb) !== 0 ? undefined : outputOf(noDb).slice(-200) },
  ]);
}

const LABEL = "verify-ap-control-ties-subledger";
export const REQUIRES_LIVE_DB = "live-only guard: reads production database (USMCA) and cannot be statically verified; run by money-pr-local-gate with DATABASE_URL";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const base = JSON.parse(readFileSync(new URL("./verify-ap-control-ties-subledger.baseline.json", import.meta.url), "utf8"));

const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
try {
  await client.query("BEGIN READ ONLY");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");
  const r = (await client.query(
    `SELECT (SELECT account_id::text FROM accounting.chart_of_accounts_roles WHERE operating_company_id = $1::uuid AND role = 'ap_control' AND is_active LIMIT 1) AS acct,
            (SELECT COALESCE(sum(CASE WHEN p.debit_or_credit::text = 'credit' THEN p.amount_cents ELSE -p.amount_cents END), 0)
               FROM accounting.journal_entry_postings p
              WHERE p.operating_company_id = $1::uuid
                AND p.account_id = (SELECT account_id FROM accounting.chart_of_accounts_roles WHERE operating_company_id = $1::uuid AND role = 'ap_control' AND is_active LIMIT 1))::bigint AS gl,
            (SELECT COALESCE(sum(amount_cents - COALESCE(paid_cents, 0)), 0) FROM accounting.bills
              WHERE operating_company_id = $1::uuid AND voided_at IS NULL AND status::text <> 'paid')::bigint AS open`, [USMCA])).rows[0];
  await client.query("ROLLBACK");
  if (!r.acct) { console.error(`${LABEL}: LIVE FAIL — USMCA has no ap_control account bound`); process.exit(1); }
  const variance = Math.abs(Number(r.gl) - Number(r.open));
  if (variance > base.variance_cents) {
    console.error(`${LABEL}: LIVE FAIL — A/P control ${r.gl} vs open bills ${r.open}: variance ${variance} cents (baseline ${base.variance_cents}, measured_at ${base.measured_at})`);
    process.exit(1);
  }
  console.log(`${LABEL}: LIVE PASS — A/P control ${r.gl} vs open bills ${r.open} cents: variance ${variance} (baseline ${base.variance_cents}, measured_at ${base.measured_at})${variance === 0 ? " — TIED" : variance < base.variance_cents ? " — SHRINK the baseline" : ""}`);
} finally {
  client.release();
  await pool.end();
}
