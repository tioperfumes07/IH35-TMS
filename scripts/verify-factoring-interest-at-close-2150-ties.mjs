#!/usr/bin/env node
// Lead ROUND 296 approval, Correction 2 (00-LEAD-APPROVAL-2026-10-02-FARO-LIFECYCLE-APPROVED-THREE-CORRECTIONS.md):
// "2150 Factoring Advance always equals the sum of the Net Amounts of open Purchased Accounts. One query, and a guard that
// fails the build if it ever doesn't." And: interest posts once at month-end close, with approval, DR 6830 / CR 2155.
//
// Static (always):
//   1. the interest-accrual engine resolves only default_interest_expense + factor_default_interest_payable — never
//      factoring_advance_liability (2150);
//   2. maker <> checker in the engine AND as a CHECK in migration 202615240600;
//   3. no cron / background job imports the propose or decide motion;
//   4. month close cannot lock while Faro interest is due and unposted.
// Live (DATABASE_URL set): per company, 2150 balance == open Net Amount of posted, live purchase lines. A live guard that
// cannot connect FAILS. --selftest plants each static regression.
export const REQUIRES_LIVE_DB = "live money guard — every arm reads production directly; fails closed with no DATABASE_URL. Runs real under money-pr-local-gate.";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-factoring-interest-at-close-2150-ties";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const F = {
  engine: "apps/backend/src/factoring/interest-accrual.service.ts",
  migration: "db/migrations/202615240600_factoring_interest_accrual_runs.sql",
  close: "apps/backend/src/accounting/month-close.service.ts",
};

export function checkStatic(src, cronSources) {
  const fails = [];
  const roles = [...src.engine.matchAll(/resolveRoleAccount\([^)]*"([a-z_]+)"\)/g)].map((m) => m[1]);
  if (roles.sort().join(",") !== "default_interest_expense,factor_default_interest_payable") {
    fails.push(`${F.engine}: resolves roles [${roles.join(", ")}] — interest is DR 6830 default_interest_expense / CR 2155 factor_default_interest_payable only`);
  }
  if (/factoring_advance_liability/.test(src.engine.replace(/\/\/.*$/gm, "").replace(/r\.role = 'factoring_advance_liability'/g, ""))) {
    fails.push(`${F.engine}: posts to factoring_advance_liability (2150) — accrued interest belongs in 2155`);
  }
  if (!/proposed_by_user_id === input\.actor_user_id\) throw new InterestAccrualError\("interest_accrual_maker_cannot_approve"\)/.test(src.engine)) {
    fails.push(`${F.engine}: the maker <> checker refusal is gone`);
  }
  if (!/decided_by_user_id IS NULL OR decided_by_user_id <> proposed_by_user_id/.test(src.migration)) {
    fails.push(`${F.migration}: the maker <> checker CHECK is gone`);
  }
  for (const [file, text] of cronSources) {
    if (/proposeInterestAccrual|decideInterestAccrual|interest-accrual\.service/.test(text)) {
      fails.push(`${file}: a scheduled job reaches the interest accrual — it posts only at close, with approval`);
    }
  }
  if (!/\(interestRunState === "posted" \|\| interestLines\.length === 0\) && pendingEventRuns === 0/.test(src.close)) {
    fails.push(`${F.close}: month close can lock while an event (collection / repurchase) accrual awaits its second approver`);
  }
  if (!/run_kind, event_purchase_line_id\)\s*VALUES \(\$1::uuid, \$2::date, \$2::date, 1, \$3, \$4::uuid, 'event', \$5::uuid\)/.test(src.engine)) {
    fails.push(`${F.engine}: the event-time accrual (owner ruling 2026-10-02) is gone or no longer a maker <> checker run`);
  }
  if (!/sum\(LEAST\(l\.gross_cents, GREATEST\(i\.total_cents - COALESCE\(i\.amount_paid_cents, 0\) - COALESCE\(cma\.applied, 0\), 0\)\)\)/.test(src.engine)) {
    fails.push(`${F.engine}: open Net must be the invoice's open balance (total − paid − credit memos), capped at purchased gross — the same definition this guard uses`);
  }
  if (!/fuelTaxComplete && factoringInterest\.complete/.test(src.close)) {
    fails.push(`${F.close}: month close can lock while Faro interest is due and unposted`);
  }
  return fails;
}

function cronFiles() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) { if (e.name !== "__tests__") walk(rel); }
      else if (/\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name) && (/cron|job|worker|scheduler/i.test(rel))) out.push(rel);
    }
  };
  walk("apps/backend/src");
  return out.map((f) => [f, fs.readFileSync(path.join(ROOT, f), "utf8")]);
}

const read = () => Object.fromEntries(Object.entries(F).map(([k, p]) => [k, fs.readFileSync(path.join(ROOT, p), "utf8")]));

if (process.argv.includes("--selftest")) {
  const good = read();
  const plants = [
    ["interest credits 2150", { engine: good.engine.replace('"factor_default_interest_payable")', '"factoring_advance_liability")') }],
    ["maker can approve", { engine: good.engine.replace('throw new InterestAccrualError("interest_accrual_maker_cannot_approve")', "void 0") }],
    ["migration check dropped", { migration: good.migration.replace("decided_by_user_id IS NULL OR decided_by_user_id <> proposed_by_user_id", "true") }],
    ["close ignores interest", { close: good.close.replace("fuelTaxComplete && factoringInterest.complete", "fuelTaxComplete") }],
    ["open Net back to gross", { engine: good.engine.replace("sum(LEAST(l.gross_cents, GREATEST(i.total_cents - COALESCE(i.amount_paid_cents, 0) - COALESCE(cma.applied, 0), 0)))", "sum(l.gross_cents)") }],
    ["close ignores pending event runs", { close: good.close.replace("&& pendingEventRuns === 0", "") }],
  ];
  if (checkStatic(good, []).length) { console.error(`${LABEL} --selftest FAIL: tree not clean: ${checkStatic(good, []).join("; ")}`); process.exit(1); }
  const missed = plants.filter(([, over]) => checkStatic({ ...good, ...over }, []).length === 0).map(([n]) => n);
  if (checkStatic(good, [["apps/backend/src/cron/x.cron.ts", "import { proposeInterestAccrual } from '../factoring/interest-accrual.service.js'"]]).length === 0) missed.push("cron proposes");
  if (missed.length) { console.error(`${LABEL} --selftest FAIL: not caught: ${missed.join("; ")}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS ${plants.length + 1}/${plants.length + 1}`);
  process.exit(0);
}

const fails = checkStatic(read(), cronFiles());
if (fails.length) {
  console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`);
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error(`${LABEL}: FAIL — static passed, but the live 2150 = open Net check needs DATABASE_URL; a live money guard that cannot run is a FAIL`);
  process.exit(1);
}
const { default: pg } = await import("pg");
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000, statement_timeout: 30000 });
try {
  await c.connect();
  await c.query("BEGIN READ ONLY");
  await c.query("SET LOCAL app.bypass_rls = 'lucia'");
  const res = await c.query(`
    WITH gl AS (
      SELECT je.operating_company_id oci, sum(CASE WHEN jp.debit_or_credit = 'credit' THEN jp.amount_cents ELSE -jp.amount_cents END) cents
        FROM accounting.journal_entry_postings jp
        JOIN accounting.journal_entries je ON je.id = jp.journal_entry_uuid AND je.status = 'posted'
        JOIN accounting.chart_of_accounts_roles r ON r.account_id = jp.account_id AND r.role = 'factoring_advance_liability'
         AND r.operating_company_id = je.operating_company_id AND r.is_active
       GROUP BY 1),
    sub AS (
      -- Open Net of a purchased account = what the customer still owes on the invoice (total − paid − credit memos applied),
      -- capped at the purchased gross — the same definition as advanceLiabilityTiesToOpenNet (asserted statically below).
      SELECT l.operating_company_id oci,
             sum(LEAST(l.gross_cents, GREATEST(i.total_cents - COALESCE(i.amount_paid_cents, 0) - COALESCE(cma.applied, 0), 0))) cents
        FROM accounting.factoring_purchase_lines l
        JOIN accounting.factoring_purchases p ON p.id = l.purchase_id
        JOIN accounting.invoices i ON i.id = l.invoice_id
        LEFT JOIN LATERAL (SELECT sum(a.applied_cents) AS applied FROM accounting.credit_memo_applications a
                            WHERE a.invoice_id = l.invoice_id AND a.operating_company_id = l.operating_company_id AND a.voided_at IS NULL) cma ON TRUE
       WHERE l.voided_at IS NULL AND p.status = 'posted' AND p.voided_at IS NULL
       GROUP BY 1)
    SELECT COALESCE(gl.oci, sub.oci)::text oci, COALESCE(gl.cents, 0)::bigint gl, COALESCE(sub.cents, 0)::bigint open_net,
           (SELECT count(*) FROM org.companies) companies
      FROM gl FULL JOIN sub ON sub.oci = gl.oci`);
  // Positive control: the role join must be able to see 2150 at all, or "0 rows" proves nothing.
  const bound = Number((await c.query(`SELECT count(*)::int n FROM accounting.chart_of_accounts_roles WHERE role = 'factoring_advance_liability' AND is_active`)).rows[0].n);
  await c.query("ROLLBACK");
  if (bound === 0) {
    console.error(`${LABEL}: FAIL — no active factoring_advance_liability role binding; the 2150 check cannot see 2150`);
    process.exit(1);
  }
  const drift = res.rows.filter((r) => Number(r.gl) !== Number(r.open_net));
  if (drift.length) {
    console.error(`${LABEL}: LIVE FAIL — 2150 does not equal the open Net Amount:`);
    for (const r of drift) console.error(`  company ${r.oci}: 2150 ${r.gl} vs open Net ${r.open_net} (cents)`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — static 7/7; live: ${res.rows.length} company(ies) with 2150 or open purchases, every one ties; positive control: ${bound} active 2150 role binding(s)`);
} catch (err) {
  console.error(`${LABEL}: FAIL — live check could not run: ${err.message}`);
  process.exit(1);
} finally {
  await c.end().catch(() => {});
}
