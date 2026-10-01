#!/usr/bin/env node
/**
 * verify-step 12065 -- ROUND 313 CC-1 #2 BANK-TIEOUT-01 (verify-bank-tieout-live).
 * STATIC (always): the engine reads GL through accounting.fn_account_balances_as_of (never its own GL sum for the
 * balance), signs feed lines the canonical way (is_credit -> +|amount|), uses the same GL population for GL-only
 * lines (je.status <> 'voided', batch posted/reversed or none), never DELETEs tie-outs, keeps FORCE RLS and no DELETE
 * grant, and is wired (cron, routes, register header).
 * LIVE (DATABASE_URL set, table present): FAIL when a live bank account with a GL account has no tie-out row in the
 * last 36 h while the engine HAS produced rows (engine went silent); REPORT unexplained differences (real data, not
 * a code defect -- never reddens on them).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const LABEL = "verify-bank-tieout-live";
const P = {
  mig: "db/migrations/202615180200_bank_account_tieouts.sql",
  svc: "apps/backend/src/banking/bank-tieout.service.ts",
  idx: "apps/backend/src/index.ts",
  reg: "apps/frontend/src/pages/accounting/AccountRegisterPage.tsx",
};
const read = (rel) => readFileSync(resolve(ROOT, rel), "utf8");

export function checkStatic(s) {
  const p = [];
  if (!/accounting\.fn_account_balances_as_of\(\$1::uuid, \$2::date, NULL\)/.test(s.svc)) p.push(`${P.svc}: GL balance no longer read via fn_account_balances_as_of.`);
  if (!/CASE WHEN bt\.is_credit THEN abs\(bt\.amount_cents\) ELSE -abs\(bt\.amount_cents\) END/.test(s.svc)) p.push(`${P.svc}: feed lines not signed the canonical way (is_credit).`);
  if (!/je\.status <> 'voided' AND \(p\.posting_batch_id IS NULL OR pb\.batch_status IN \('posted', 'reversed'\)\)/.test(s.svc)) p.push(`${P.svc}: GL-only population differs from fn_account_balances_as_of.`);
  if (/DELETE FROM banking\.bank_account_tieouts/i.test(s.svc)) p.push(`${P.svc}: engine deletes tie-outs.`);
  if (!/FORCE ROW LEVEL SECURITY/.test(s.mig) || /GRANT[^;]*DELETE[^;]*bank_account_tieouts/i.test(s.mig)) p.push(`${P.mig}: FORCE RLS missing or DELETE granted.`);
  if (!/registerBankTieoutRoutes\(app\)/.test(s.idx) || !/initializeBankTieoutCron\(app\)/.test(s.idx)) p.push(`${P.idx}: tie-out routes or cron not wired.`);
  if (!/<BankTieoutHeader /.test(s.reg)) p.push(`${P.reg}: register no longer shows the bank tie-out header.`);
  return p;
}

async function live() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.log(`${LABEL}: live half SKIP -- no DATABASE_URL (static half is authoritative offline).`); return []; }
  const { default: pg } = await import("pg");
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    await c.query("BEGIN READ ONLY");
    const exists = (await c.query(`SELECT to_regclass('banking.bank_account_tieouts') AS t`)).rows[0]?.t;
    if (!exists) { console.log(`${LABEL}: live half REPORT -- banking.bank_account_tieouts not applied yet (migration 202615180200 rides the next deploy).`); return []; }
    await c.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    const produced = Number((await c.query(`SELECT count(*)::int AS n FROM banking.bank_account_tieouts`)).rows[0]?.n ?? 0);
    if (produced === 0) { console.log(`${LABEL}: live half REPORT -- engine has not run yet (first nightly 05:50 CT or first register view).`); return []; }
    const missing = (await c.query(
      `SELECT ba.id::text, COALESCE(ba.display_name, ba.account_name) AS label FROM banking.bank_accounts ba
        WHERE ba.is_active AND ba.deactivated_at IS NULL AND ba.ledger_account_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM banking.bank_account_tieouts t WHERE t.bank_account_id = ba.id AND t.computed_at >= now() - interval '36 hours')`
    )).rows;
    const unexplained = (await c.query(`SELECT count(*)::int AS n FROM banking.bank_account_tieouts WHERE tieout_date >= CURRENT_DATE - 1 AND status = 'unexplained'`)).rows[0]?.n ?? 0;
    console.log(`${LABEL}: live REPORT -- ${unexplained} account(s) with an unexplained difference in the last day (data to work, not a code defect).`);
    return missing.map((m) => `live: bank account ${m.label} (${m.id}) has no tie-out in 36 h -- the engine went silent.`);
  } finally { await c.end(); }
}

const real = Object.fromEntries(Object.entries(P).map(([k, v]) => [k, read(v)]));
if (process.argv.includes("--selftest")) {
  let ok = true;
  const ex = (n, s, f) => { const pr = checkStatic(s); if ((pr.length > 0) !== f) { console.error(`SELFTEST FAIL: ${n}: ${JSON.stringify(pr)}`); ok = false; } };
  ex("real", real, false);
  ex("own GL math", { ...real, svc: real.svc.replace("accounting.fn_account_balances_as_of($1::uuid, $2::date, NULL)", "my_gl()") }, true);
  ex("wrong sign", { ...real, svc: real.svc.replaceAll("CASE WHEN bt.is_credit THEN abs(bt.amount_cents) ELSE -abs(bt.amount_cents) END", "bt.amount_cents") }, true);
  ex("delete grant", { ...real, mig: real.mig.replace("GRANT SELECT, INSERT, UPDATE ON banking.bank_account_tieouts", "GRANT SELECT, INSERT, UPDATE, DELETE ON banking.bank_account_tieouts") }, true);
  ex("header unwired", { ...real, reg: real.reg.replace("<BankTieoutHeader ", "<X ") }, true);
  console.log(ok ? `${LABEL} --selftest PASS (5/5)` : `${LABEL} --selftest FAIL`);
  process.exit(ok ? 0 : 1);
}
const problems = [...checkStatic(real), ...(await live())];
if (problems.length) { console.error(`${LABEL} FAILED:\n  - ${problems.join("\n  - ")}`); process.exit(1); }
console.log(`${LABEL}: OK -- tie-out engine on the shared GL function, canonical signs, same GL population, void-free, wired.`);
