#!/usr/bin/env node
/**
 * ROUND 365.1 — FAILS IF a poster finds the account it posts to by account NUMBER or account NAME instead of by ROLE.
 * A number or a name is a fact about one company's chart; a role (accounting.chart_of_accounts_roles) is the contract the
 * owner designates, and resolveRoleAccount fails CLOSED, naming the role, where it is not bound.
 *
 *   static — apps/backend/src (no tests): no SQL literal `account_number = '…'`, no accountByNumber(), no
 *            `*_ACCOUNT_NUMBER = "…"` / `accountNumber = "<digits>"`, no `account_name ILIKE '%…'` guess. One file is
 *            exempt BY NAME with the reason (the account provisioner that CREATES the accounts roles bind to). The
 *            exemption list is shrink-only: an entry with no hit left FAILS.
 *   live   — USMCA only (TRANSPORTATION / TRUCKING are frozen and never read):
 *            · 0 roles bound to more than one active account;
 *            · every role the backend references that is UNBOUND is named in UNBOUND_BY_RULING with its reason
 *              (shrink-only both ways — a listed role that is now bound FAILS until removed);
 *            · every account bound to TWO OR MORE roles is classified in SHARED_ACCOUNT_RULINGS (ruling or defect,
 *              with owner) — an unclassified pair FAILS, a listed pair that no longer exists FAILS;
 *            · REPORTED: roles bound but referenced by no code.
 *   Before 202615370930 is applied the live findings are reported, not enforced (PENDING DEPLOY).
 * Run: node scripts/verify-every-poster-resolves-by-role-not-by-name-or-number.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

export const REQUIRES_LIVE_DB = "the role map is a live fact: bindings, multi-binds and shared accounts are read from production";
const LABEL = "verify-every-poster-resolves-by-role-not-by-name-or-number";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATION = "202615370930_every_poster_resolves_by_role_bindings.sql";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const RESOLVER = "apps/backend/src/accounting/coa-roles/resolver.service.ts";

export const PATTERNS = [
  [/account_number\s*(?:=|IN)\s*\(?\s*'[^'$]/, "SQL literal account_number"],
  [/\baccountByNumber\s*\(/, "accountByNumber()"],
  [/_ACCOUNT_NUMBER\s*=\s*["'`]/, "*_ACCOUNT_NUMBER constant"],
  [/\baccountNumber\s*=\s*["'][0-9]/, "accountNumber = \"<digits>\""],
  [/account_name\s+I?LIKE\s+'%/, "account_name ILIKE guess"],
];

/** Shrink-only. Each entry must still have at least one hit, or it FAILS (remove it). */
export const EXEMPT = new Map([
  ["apps/backend/src/accounting/driver-subaccount-provision.service.ts", "the account PROVISIONER: it creates 2175 / 2175-00 by their owner-approved numbers (R-185); it posts nothing"],
]);

/** Referenced by code, deliberately unbound on USMCA — the poster fails closed by name. Shrink-only both ways. */
export const UNBOUND_BY_RULING = new Map([
  ["sales_tax_payable", "no sales-tax activity in a freight carrier's chart; the invoice tax leg fails closed if ever hit"],
  ["settlement_dispute_correction_recovery", "owner accounting-treatment decision (ACCT-F5616) — fails closed until designated"],
  ["rental_income", "lease-to-own lessor income — TRANSP-side engine; USMCA leases nothing out"],
  ["lease_receivable", "lessor receivable — same engine as rental_income"],
  ["gain_loss_on_disposal", "asset disposal — USMCA owns no assets today (entity law 4)"],
  ["cash_basis_adjustment_equity", "cash-basis report adjustment — owner designates"],
  ["detention_pay_expense", "detention pay falls back to driver_pay_expense by design (DWELL-01-D3)"],
  ["fuel_advance_recovery", "fuel-advance deduction bucket — owner designates; bucket refuses until then"],
  ["rou_asset", "ASC 842 lessee — HELD migration 202615210000"],
  ["lease_liability", "ASC 842 lessee — HELD migration 202615210000"],
  ["accumulated_rou_amortization", "ASC 842 lessee — HELD migration 202615210000"],
  ["lease_interest_expense", "ASC 842 lessee — HELD migration 202615210000"],
]);

/** One account under two or more roles: classified against the owner rulings. Shrink-only both ways. */
export const SHARED_ACCOUNT_RULINGS = new Map([
  ["cash_dip|operating_bank", "RULING — both mean 'the operating bank' (DIP operating cash = Bank of America Operating, owner 2026-08-11)"],
  ["cash_clearing|undeposited_funds", "DEFECT — ROUND 378.7: cash_clearing must be unbound from 1090 Undeposited Funds ('one role, one meaning'); CC-2 (1090 counterparty refusal, ROUND 381 row 3)"],
  ["factor_reserve_default|factor_reserve_held", "RULING — Lead 2026-10-02 TWO-ESCROWS: 1230 stands as the factor reserve; _default is the picker alias of _held"],
  ["lease_recovery|rent_expense", "RULING — owner: a lease deduction recovers the SAME 5800 lease expense it offsets (contra-expense, never income)"],
  ["bank_fee_recovery|factor_wire_fee", "RULING — SETL-DED-UI: a wire-fee recovery credits the SAME 6300 account the fee posted to, never a revenue line"],
]);

export function staticHits(files) {
  const hits = [];
  for (const { rel, src } of files) {
    src.split("\n").forEach((line, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
      for (const [re, what] of PATTERNS) if (re.test(line)) hits.push({ rel, line: i + 1, what, text: line.trim().slice(0, 140) });
    });
  }
  return hits;
}

export function staticProblems(hits) {
  const problems = [];
  for (const h of hits) {
    if (!EXEMPT.has(h.rel)) problems.push(`${h.rel}:${h.line}: ${h.what} — resolve the account by ROLE (resolveRoleAccount), never by number or name: ${h.text}`);
  }
  for (const rel of EXEMPT.keys()) {
    if (!hits.some((h) => h.rel === rel)) problems.push(`${rel}: exempt but has no by-number/by-name hit left — remove it from EXEMPT (shrink-only)`);
  }
  return problems;
}

export function roleValues(resolverSrc) {
  const m = resolverSrc.match(/export const COA_ROLE_VALUES = \[([\s\S]*?)\] as const;/);
  return m ? [...m[1].matchAll(/"([a-z0-9_]+)"/g)].map((x) => x[1]) : [];
}

/** Roles quoted anywhere in backend code outside coa-roles/ — plus the {type}_recovery family bucketRecoveryRoleKey builds. */
export function referencedRoles(roles, files) {
  const used = new Set();
  for (const { rel, src } of files) {
    if (rel.includes("/coa-roles/")) continue;
    for (const r of roles) if (src.includes(`"${r}"`) || src.includes(`'${r}'`)) used.add(r);
    if (/bucketRecoveryRoleKey|`\$\{[^}]+\}_recovery`/.test(src)) for (const r of roles) if (r.endsWith("_recovery")) used.add(r);
  }
  return used;
}

/** live: { bindings: [{role, account_number}] } -> { problems, report } */
export function liveProblems({ bindings, referenced }) {
  const problems = [];
  const report = [];
  const byRole = new Map();
  const byAccount = new Map();
  for (const b of bindings) {
    byRole.set(b.role, [...(byRole.get(b.role) ?? []), b.account_number]);
    byAccount.set(b.account_number, [...(byAccount.get(b.account_number) ?? []), b.role]);
  }
  for (const [role, accts] of byRole) if (accts.length > 1) problems.push(`role ${role} is bound to ${accts.length} accounts (${accts.join(", ")}) — one role, one account`);
  for (const role of referenced) {
    const bound = byRole.has(role);
    if (!bound && !UNBOUND_BY_RULING.has(role)) problems.push(`role ${role} is referenced by the backend but UNBOUND on USMCA — bind it, or name the ruling in UNBOUND_BY_RULING`);
  }
  for (const role of UNBOUND_BY_RULING.keys()) if (byRole.has(role)) problems.push(`role ${role} is now bound — remove it from UNBOUND_BY_RULING (shrink-only)`);
  const shared = new Set();
  for (const [acct, roles] of byAccount) {
    if (roles.length < 2) continue;
    const key = [...roles].sort().join("|");
    shared.add(key);
    const ruling = SHARED_ACCOUNT_RULINGS.get(key);
    if (!ruling) problems.push(`account ${acct} is bound to ${roles.length} roles (${key}) with no classification — add it to SHARED_ACCOUNT_RULINGS (ruling or defect + owner)`);
    else report.push(`shared ${acct}: ${key} — ${ruling}`);
  }
  for (const key of SHARED_ACCOUNT_RULINGS.keys()) if (!shared.has(key)) problems.push(`SHARED_ACCOUNT_RULINGS lists ${key}, which no longer shares an account — remove it (shrink-only)`);
  const unused = [...byRole.keys()].filter((r) => !referenced.has(r)).sort();
  report.push(`bound but referenced by no code (${unused.length}): ${unused.join(", ") || "none"}`);
  return { problems, report };
}

function backendFiles() {
  return execSync("git ls-files apps/backend/src", { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter((p) => p.endsWith(".ts") && !/__tests__|\.test\.ts$/.test(p))
    .map((rel) => ({ rel, src: fs.readFileSync(path.join(ROOT, rel), "utf8") }));
}

if (process.argv.includes("--selftest")) {
  const f = (src, rel = "apps/backend/src/x.ts") => [{ rel, src }];
  const cases = [
    ["a SQL literal account number FAILS", staticProblems(staticHits(f("q(`SELECT id FROM catalogs.accounts WHERE account_number = '2250'`)"))).length === 1 + EXEMPT.size],
    ["the same literal in an EXEMPT file passes", staticProblems(staticHits(f("AND account_number = '2175'", [...EXEMPT.keys()][0]))).length === EXEMPT.size - 1],
    ["a name guess FAILS", staticHits(f("AND account_name ILIKE '%fuel%advance%'")).length === 1],
    ["a parameterised search is not a guess", staticHits(f("AND account_number ILIKE $2")).length === 0],
    ["a comment is ignored", staticHits(f("// account_number = '1100'")).length === 0],
    ["an exemption with no hit FAILS (shrink-only)", staticProblems([]).length === EXEMPT.size],
    ["multi-bound role FAILS", liveProblems({ bindings: [{ role: "ar_control", account_number: "1100" }, { role: "ar_control", account_number: "1101" }], referenced: new Set() }).problems.some((p) => p.includes("bound to 2"))],
    ["referenced + unbound + unnamed FAILS", liveProblems({ bindings: [], referenced: new Set(["ar_control"]) }).problems.some((p) => p.includes("UNBOUND"))],
    ["unclassified shared account FAILS", liveProblems({ bindings: [{ role: "a", account_number: "9" }, { role: "b", account_number: "9" }], referenced: new Set() }).problems.some((p) => p.includes("no classification"))],
    ["the real tree is clean", staticProblems(staticHits(backendFiles())).length === 0],
  ];
  const bad = cases.filter(([, ok]) => !ok);
  if (bad.length) {
    console.error(`${LABEL} selftest FAIL: ${bad.map(([n]) => n).join("; ")}`);
    for (const p of staticProblems(staticHits(backendFiles()))) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} selftest ${cases.length}/${cases.length}`);
  process.exit(0);
}

const files = backendFiles();
const fails = staticProblems(staticHits(files));
const roles = roleValues(fs.readFileSync(path.join(ROOT, RESOLVER), "utf8"));
if (!roles.length) fails.push(`could not read COA_ROLE_VALUES from ${RESOLVER}`);
const referenced = referencedRoles(roles, files);
const { client: c, pool } = await requireLiveDbOrExit({ label: LABEL });
try {
  await c.query("BEGIN READ ONLY");
  await c.query("SET LOCAL app.bypass_rls = 'lucia'");
  const applied = (await c.query(`SELECT 1 FROM _system._schema_migrations WHERE filename = $1`, [MIGRATION])).rowCount > 0;
  const bindings = (await c.query(
    `SELECT r.role, a.account_number FROM accounting.chart_of_accounts_roles r JOIN catalogs.accounts a ON a.id = r.account_id
      WHERE r.operating_company_id = $1::uuid AND r.is_active ORDER BY r.role`, [USMCA])).rows;
  await c.query("ROLLBACK");
  if (!bindings.length) fails.push("read 0 active role bindings for USMCA — an empty map is a question, not an answer (credential / RLS?)");
  const { problems, report } = liveProblems({ bindings, referenced });
  console.log(`${LABEL}: USMCA ${bindings.length} active bindings, ${referenced.size} roles referenced by the backend`);
  for (const r of report) console.log(`  ${r}`);
  if (!applied) {
    console.log(`${LABEL}: PENDING DEPLOY — ${MIGRATION} not in the ledger; ${problems.length} live finding(s) reported, not enforced:`);
    for (const p of problems) console.log(`  (pending) ${p}`);
  } else {
    fails.push(...problems);
  }
} finally {
  c.release();
  await pool.end();
}
if (fails.length) { for (const x of fails) console.error(`FAIL ${x}`); process.exit(1); }
console.log(`${LABEL}: PASS — every poster resolves its account by role`);
