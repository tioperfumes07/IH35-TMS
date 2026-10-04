#!/usr/bin/env node
/**
 * verify-driver-advance-posts-to-drivers-own-subaccount — ROUND 394 RULING 1, CC-1.
 *
 * A driver cash advance is money the driver owes the company: a receivable on the driver's OWN 1245
 * sub-account. Disbursement DEBITS it, pay-run close CREDITS the same account; no shared cash_advance /
 * advance_recovery account on either side. The sub-account is resolved through the driver-keyed bridge
 * (driver_finance.driver_advance_accounts) and must be a child of the account bound to the advance_recovery
 * role — never by number or name (365.1).
 *
 * STATIC:
 *   RULE 1 — the resolver joins the bridge AND pins parent_account_id to the advance_recovery role account.
 *   RULE 2 — posting-engine: both advance builders (cash_advance, driver_advance) debit through
 *            resolveDriverAdvanceDebitAccount; no resolveAccountForCategory(…"cash_advance"…) remains.
 *   RULE 3 — pay-run close: the advance credit resolves the driver's own sub-account in BOTH paths (legacy legs
 *            and the A/P chain); no resolvePayRunRoleAccount(…, "advance_recovery") credit remains.
 *   RULE 4 — advance creation refuses an unbound driver before any row is written.
 *   RULE 6 — (step 2a) migration 202615380400 defines driver_finance.v_driver_advance_balances over the driver's
 *            own sub-account pinned to the advance_recovery role parent, and repoints recompute_driver_debt,
 *            views.banking_account_tiles and views.cash_advances_with_context to it.
 *   RULE 7 — every advance-balance reader (pay-run recovery, fuel-advance open check, the two reversal guards,
 *            the advance-pool tile, driver advances list, debt history, driver hub, driver profile, the GL
 *            tie-out detector) reads v_driver_advance_balances.
 * LIVE (direct, read-only, USMCA only — TRANSP/TRK are frozen):
 *   RULE 5 — 0 postings on the advance_recovery PARENT account itself created on/after SINCE that are not a
 *            reversal of an older line (every new advance movement lands on a driver's own sub-account).
 *   RULE 8 — while driver_advances.outstanding_balance still exists, the view's outstanding equals it on every
 *            USMCA advance (the readers read the same number they read before; 202615380500 then drops it).
 *   Reported, not failed: drivers with an advance but no bound sub-account (creation refuses them).
 * --selftest exercises every rule.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-advance-posts-to-drivers-own-subaccount";
export const SINCE = "2026-10-05";
export const REQUIRES_LIVE_DB = "driver advances are live money — fails closed without a database";
const SRC = "apps/backend/src";
export const FILES = {
  resolver: `${SRC}/driver-finance/driver-advance-account-resolver.ts`,
  engine: `${SRC}/accounting/posting-engine.service.ts`,
  payrun: `${SRC}/driver-finance/settlement-payrun-close.service.ts`,
  create: `${SRC}/cash-advances/cash-advance-create.ts`,
};
export const VIEW_MIG = "db/migrations/202615380400_driver_advance_balance_derived_from_gl.sql";
export const VIEW_READERS = [
  `${SRC}/driver-finance/settlement-payrun-close.service.ts`,
  `${SRC}/accounting/fuel-posting/poster.service.ts`,
  `${SRC}/cash-advances/cash-advances.routes.ts`,
  `${SRC}/dispatch/cancellation.service.ts`,
  `${SRC}/banking/banking.routes.ts`,
  `${SRC}/drivers/advances.routes.ts`,
  `${SRC}/master-data/drivers/operations-depth/debt-history.service.ts`,
  `${SRC}/mdata/canonical/driver-hub.service.ts`,
  `${SRC}/mdata/canonical/driver-profile.service.ts`,
  `${SRC}/reconciliation/ledger-integrity-detectors.service.ts`,
];

function body(src, name) {
  const i = src.indexOf(`async function ${name}(`);
  if (i < 0) return null;
  const j = src.indexOf("\nasync function ", i + 1);
  const k = src.indexOf("\nexport async function ", i + 1);
  const end = [j, k].filter((x) => x > 0).sort((a, b) => a - b)[0] ?? src.length;
  return src.slice(i, end);
}

export function staticProblems(read) {
  const out = [];
  const r = read(FILES.resolver);
  if (!/driver_finance\.driver_advance_accounts/.test(r) || !/a\.parent_account_id = \$3::uuid/.test(r) || !/"advance_recovery"/.test(r)) {
    out.push("RULE 1 the resolver no longer pins the bridge account under the advance_recovery role parent");
  }
  const e = read(FILES.engine);
  if (/resolveAccountForCategory\([^)]*"cash_advance"/.test(e)) out.push("RULE 2 posting-engine still resolves the shared cash_advance category account");
  for (const b of ["buildCashAdvanceLines", "buildDriverAdvanceLines"]) {
    const fn = body(e, b);
    if (!fn) out.push(`RULE 2 ${b} is missing`);
    else if (!/resolveDriverAdvanceDebitAccount\(/.test(fn)) out.push(`RULE 2 ${b} does not debit the driver's own sub-account`);
  }
  const p = read(FILES.payrun);
  if (/resolvePayRunRoleAccount\([^)]*"advance_recovery"\)/.test(p)) out.push("RULE 3 pay-run close still credits the shared advance_recovery account");
  if ((p.match(/resolveDriverAdvanceSubAccountOptional\(/g) ?? []).length < 2) out.push("RULE 3 pay-run close does not resolve the driver's own sub-account in both the legs and A/P-chain paths");
  const c = read(FILES.create);
  if (!/await resolveDriverAdvanceSubAccount\(/.test(c)) out.push("RULE 4 advance creation does not refuse an unbound driver");
  const m = read(VIEW_MIG);
  if (!m) out.push(`RULE 6 ${VIEW_MIG} is missing`);
  else {
    if (!/CREATE OR REPLACE VIEW driver_finance\.v_driver_advance_balances/.test(m) || !/r\.role = 'advance_recovery'/.test(m)) out.push("RULE 6 v_driver_advance_balances is not defined over the advance_recovery role parent");
    for (const o of ["driver_finance.recompute_driver_debt", "views.banking_account_tiles", "views.cash_advances_with_context"]) {
      if (!new RegExp(`CREATE OR REPLACE (VIEW|FUNCTION) ${o.replace(".", "\\.")}(?:(?!CREATE OR REPLACE)[\\s\\S])*?v_driver_advance_balances`).test(m)) out.push(`RULE 6 ${o} is not repointed to v_driver_advance_balances`);
    }
  }
  for (const f of VIEW_READERS) {
    if (!/driver_finance\.v_driver_advance_balances/.test(read(f) ?? "")) out.push(`RULE 7 ${f} does not read the GL-derived advance balance`);
  }
  return out;
}

export function liveProblems(m) {
  const out = [];
  if (m.parentSince > 0) out.push(`RULE 5 ${m.parentSince} posting(s) on the shared advance_recovery parent since ${SINCE} that are not reversals`);
  if (m.mismatch > 0) out.push(`RULE 8 ${m.mismatch} USMCA advance(s) whose GL-derived outstanding differs from the stored outstanding_balance`);
  return out;
}

export function run() {
  return staticProblems((f) => (existsSync(join(ROOT, f)) ? readFileSync(join(ROOT, f), "utf8") : null));
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) {
    const good = {
      [FILES.resolver]: 'resolveRoleAccountOptional(client, opco, "advance_recovery"); FROM driver_finance.driver_advance_accounts daa JOIN catalogs.accounts a WHERE a.parent_account_id = $3::uuid',
      [FILES.engine]: "async function buildCashAdvanceLines() { await resolveDriverAdvanceDebitAccount(client); }\nasync function buildDriverAdvanceLines() { await resolveDriverAdvanceDebitAccount(client); }\nasync function other() {}",
      [FILES.payrun]: "resolveDriverAdvanceSubAccountOptional(client, opco, d); resolveDriverAdvanceSubAccountOptional(client, opco, d);",
      [FILES.create]: "await resolveDriverAdvanceSubAccount(client, companyId, driverId);",
      [VIEW_MIG]: "CREATE OR REPLACE VIEW driver_finance.v_driver_advance_balances AS SELECT 1 WHERE r.role = 'advance_recovery';\nCREATE OR REPLACE FUNCTION driver_finance.recompute_driver_debt() x driver_finance.v_driver_advance_balances;\nCREATE OR REPLACE VIEW views.banking_account_tiles AS x driver_finance.v_driver_advance_balances;\nCREATE OR REPLACE VIEW views.cash_advances_with_context AS x driver_finance.v_driver_advance_balances;",
    };
    for (const f of VIEW_READERS) if (!(f in good)) good[f] = "FROM driver_finance.v_driver_advance_balances vb";
    if (!good[FILES.payrun].includes("v_driver_advance_balances")) good[FILES.payrun] += " FROM driver_finance.v_driver_advance_balances";
    const reader = (over) => (f) => (over[f] ?? good[f]);
    const has = (over, rule) => staticProblems(reader(over)).some((x) => x.startsWith(rule));
    const cases = [
      ["the shipped shape passes", staticProblems(reader({})).length === 0],
      ["a resolver without the role-parent pin fails", has({ [FILES.resolver]: good[FILES.resolver].replace("a.parent_account_id = $3::uuid", "true") }, "RULE 1")],
      ["the shared cash_advance category debit fails", has({ [FILES.engine]: good[FILES.engine] + '\nresolveAccountForCategory(opco, "cash_advance", "cash_advance")' }, "RULE 2")],
      ["a builder that skips the driver's own account fails", has({ [FILES.engine]: good[FILES.engine].replace("async function buildDriverAdvanceLines() { await resolveDriverAdvanceDebitAccount(client); }", "async function buildDriverAdvanceLines() { }") }, "RULE 2")],
      ["the shared advance_recovery credit fails", has({ [FILES.payrun]: good[FILES.payrun] + 'resolvePayRunRoleAccount(client, opco, "advance_recovery")' }, "RULE 3")],
      ["only one pay-run path on the own account fails", has({ [FILES.payrun]: "resolveDriverAdvanceSubAccountOptional(client, opco, d);" }, "RULE 3")],
      ["creation without the refusal fails", has({ [FILES.create]: "" }, "RULE 4")],
      ["a view not pinned to the role parent fails", has({ [VIEW_MIG]: good[VIEW_MIG].replace("r.role = 'advance_recovery'", "true") }, "RULE 6")],
      ["the debt function left on the stored balance fails", has({ [VIEW_MIG]: good[VIEW_MIG].replace("recompute_driver_debt() x driver_finance.v_driver_advance_balances", "recompute_driver_debt() x l.current_balance") }, "RULE 6")],
      ["a reader back on the stored balance fails", has({ [VIEW_READERS[1]]: "l.current_balance" }, "RULE 7")],
      ["live clean passes", liveProblems({ parentSince: 0, mismatch: 0 }).length === 0],
      ["a derived/stored mismatch fails", liveProblems({ parentSince: 0, mismatch: 1 }).some((x) => x.startsWith("RULE 8"))],
      ["a new posting on the shared parent fails", liveProblems({ parentSince: 1, mismatch: 0 }).some((x) => x.startsWith("RULE 5"))],
    ];
    for (const [n, ok] of cases) console.log(`  ${ok ? "✓" : "✗"} ${n}`);
    const bad = cases.filter(([, ok]) => !ok).length;
    console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
    process.exit(bad ? 1 : 0);
  }
  const problems = run();
  const { requireLiveDbOrExit } = await import("./lib/require-live-db.mjs");
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
    const parentSince = (await client.query(
      `SELECT count(*)::int n
         FROM accounting.journal_entry_postings p
         JOIN accounting.chart_of_accounts_roles r
           ON r.account_id = p.account_id AND r.operating_company_id = p.operating_company_id AND r.role = 'advance_recovery' AND r.is_active
        WHERE p.operating_company_id = (SELECT id FROM org.companies WHERE code = 'USMCA')
          AND p.created_at >= $1::date AND p.reversal_of_line_id IS NULL`,
      [SINCE]
    )).rows[0].n;
    const unbound = (await client.query(
      `SELECT count(DISTINCT a.driver_id)::int n
         FROM driver_finance.driver_advances a
        WHERE a.operating_company_id = (SELECT id FROM org.companies WHERE code = 'USMCA')
          AND NOT EXISTS (
          SELECT 1 FROM driver_finance.driver_advance_accounts d
            JOIN catalogs.accounts s ON s.id = d.coa_account_id AND s.is_postable AND s.deactivated_at IS NULL
            JOIN accounting.chart_of_accounts_roles r ON r.account_id = s.parent_account_id AND r.operating_company_id = d.operating_company_id AND r.role = 'advance_recovery' AND r.is_active
           WHERE d.driver_id = a.driver_id AND d.operating_company_id = a.operating_company_id AND d.is_active)`
    )).rows[0].n;
    const hasView = (await client.query(`SELECT to_regclass('driver_finance.v_driver_advance_balances') IS NOT NULL AS ok`)).rows[0].ok;
    const hasColumn = (await client.query(`SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'driver_finance' AND table_name = 'driver_advances' AND column_name = 'outstanding_balance') AS ok`)).rows[0].ok;
    const mismatch = hasView && hasColumn
      ? (await client.query(`SELECT count(*)::int n FROM driver_finance.v_driver_advance_balances v JOIN driver_finance.driver_advances a ON a.id = v.advance_id
            WHERE a.operating_company_id = (SELECT id FROM org.companies WHERE code = 'USMCA') AND v.outstanding_cents <> round(COALESCE(a.outstanding_balance, 0) * 100)`)).rows[0].n
      : 0;
    await client.query("ROLLBACK");
    problems.push(...liveProblems({ parentSince, mismatch }));
    if (problems.length) { console.error(`${LABEL}: FAIL\n  ${problems.join("\n  ")}`); process.exitCode = 1; }
    else console.log(`${LABEL}: OK — static rules 1-4, 6-7 hold; 0 postings on the shared advance_recovery parent since ${SINCE}; ${hasView ? (hasColumn ? "derived outstanding = stored outstanding_balance on every USMCA advance" : "outstanding_balance dropped — the GL is the only balance") : "202615380400 not applied on this database yet"}. Drivers with an advance and no bound own sub-account (creation refuses them): ${unbound}.`);
  } finally {
    client.release?.();
    await pool?.end?.();
  }
}
