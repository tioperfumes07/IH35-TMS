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
 * LIVE (direct, read-only, USMCA only — TRANSP/TRK are frozen):
 *   RULE 5 — 0 postings on the advance_recovery PARENT account itself created on/after SINCE that are not a
 *            reversal of an older line (every new advance movement lands on a driver's own sub-account).
 *   Reported, not failed: drivers with an advance but no bound sub-account (creation refuses them).
 * --selftest exercises every rule.
 */
import { readFileSync } from "node:fs";
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
  return out;
}

export function liveProblems(m) {
  return m.parentSince > 0 ? [`RULE 5 ${m.parentSince} posting(s) on the shared advance_recovery parent since ${SINCE} that are not reversals`] : [];
}

export function run() {
  return staticProblems((f) => readFileSync(join(ROOT, f), "utf8"));
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) {
    const good = {
      [FILES.resolver]: 'resolveRoleAccountOptional(client, opco, "advance_recovery"); FROM driver_finance.driver_advance_accounts daa JOIN catalogs.accounts a WHERE a.parent_account_id = $3::uuid',
      [FILES.engine]: "async function buildCashAdvanceLines() { await resolveDriverAdvanceDebitAccount(client); }\nasync function buildDriverAdvanceLines() { await resolveDriverAdvanceDebitAccount(client); }\nasync function other() {}",
      [FILES.payrun]: "resolveDriverAdvanceSubAccountOptional(client, opco, d); resolveDriverAdvanceSubAccountOptional(client, opco, d);",
      [FILES.create]: "await resolveDriverAdvanceSubAccount(client, companyId, driverId);",
    };
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
      ["live clean passes", liveProblems({ parentSince: 0 }).length === 0],
      ["a new posting on the shared parent fails", liveProblems({ parentSince: 1 }).some((x) => x.startsWith("RULE 5"))],
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
    await client.query("ROLLBACK");
    problems.push(...liveProblems({ parentSince }));
    if (problems.length) { console.error(`${LABEL}: FAIL\n  ${problems.join("\n  ")}`); process.exitCode = 1; }
    else console.log(`${LABEL}: OK — static rules 1-4 hold; 0 postings on the shared advance_recovery parent since ${SINCE}. Drivers with an advance and no bound own sub-account (creation refuses them): ${unbound}.`);
  } finally {
    client.release?.();
    await pool?.end?.();
  }
}
