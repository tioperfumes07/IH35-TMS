#!/usr/bin/env node
/**
 * GUARD (U27 / ROUND 433): no surface prints a raw ledger sign, and no engine compares one with a real-world number.
 *
 * The ledger stores balances debit − credit. The natural sign comes from the ACCOUNT TYPE (never inferred from the
 * posting): assets/expenses positive in debit, liabilities/equity/income positive in credit. Three rules:
 *   1. PARITY — the debit-normal account-type set is identical in fn_account_balances_as_of (SQL), the backend helper
 *      (accounting/natural-sign.ts) and the frontend helper (lib/naturalBalance.ts). Two definitions of "which side an
 *      account lives on" is how a screen and the ledger disagree.
 *   2. BACKEND — every non-test file that reads accounting.fn_account_balances_as_of carries the sign with it
 *      (normal_balance, account_type, or naturalSignFactor). Found 2026-10-06: the bank tie-out and live-balance drift
 *      compared a card feed (amount OWED, positive) with the raw Liability balance (negative) — a card that ties
 *      exactly would report twice its balance as drift (Amex-Scentsx, Dreamline Diesel Card are Liability-backed).
 *   3. FRONTEND — a file that imports a raw-ledger API (account-balances, reclassify account tree) AND reads a
 *      balance field from it renders through lib/naturalBalance (directly or via coa-list-utils). Pickers that only
 *      list accounts are not surfaces.
 * Run: node scripts/verify-no-surface-prints-a-raw-ledger-sign.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-no-surface-prints-a-raw-ledger-sign";
const SQL_FN = "db/migrations/202606072356_accounting_account_balances.sql";
const BE_HELPER = "apps/backend/src/accounting/natural-sign.ts";
const FE_HELPER = "apps/frontend/src/lib/naturalBalance.ts";
const RAW_FE_APIS = /\b(fetchAccountBalances|getReclassifyAccountTree|getReclassifyAccounts)\b/;
const BALANCE_FIELD = /\b(closing_balance_cents|period_activity_cents|opening_balance_cents|balance_cents)\b/;
const NATURAL_FE = /from\s+["'][^"']*(lib\/naturalBalance|\/coa-list-utils)["']/;

const setFrom = (text) => new Set([...text.matchAll(/["'](Asset|CostOfGoodsSold|Expense|OtherExpense|Liability|Equity|Income|OtherIncome)["']/g)].map((m) => m[1]));
const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

export function parityProblems(sqlText, beText, feText) {
  const sqlLine = (sqlText.match(/WHEN COALESCE\(a\.account_type, ''\) IN \(([^)]*)\)/) ?? [])[1];
  const be = (beText.match(/DEBIT_NORMAL_ACCOUNT_TYPES[^=]*=\s*new Set\(\[([^\]]*)\]/) ?? [])[1];
  const fe = (feText.match(/DEBIT_NORMAL\s*=\s*new Set\(\[([^\]]*)\]/) ?? [])[1];
  if (!sqlLine || !be || !fe) return [`parity: could not read the debit-normal set (sql=${!!sqlLine} backend=${!!be} frontend=${!!fe}) — an unread rule is not a pass`];
  const s = setFrom(sqlLine), b = setFrom(be), f = setFrom(fe);
  const out = [];
  if (!sameSet(s, b)) out.push(`parity: backend natural-sign set {${[...b]}} differs from fn_account_balances_as_of {${[...s]}}`);
  if (!sameSet(s, f)) out.push(`parity: frontend naturalBalance set {${[...f]}} differs from fn_account_balances_as_of {${[...s]}}`);
  return out;
}

export function backendProblems(files) {
  return files
    .filter(({ src }) => /fn_account_balances_as_of/.test(src))
    .filter(({ src }) => !/normal_balance|account_type|naturalSignFactor|naturalSignCents/.test(src))
    .map(({ file }) => `${file}: reads fn_account_balances_as_of (raw debit − credit) without the account's sign (normal_balance / account_type / naturalSignFactor)`);
}

export function frontendProblems(files) {
  return files
    .filter(({ src }) => RAW_FE_APIS.test(src) && BALANCE_FIELD.test(src) && !NATURAL_FE.test(src))
    .map(({ file }) => `${file}: imports a raw-ledger API and reads a balance field, but never renders through lib/naturalBalance`);
}

function selftest() {
  const sql = "WHEN COALESCE(a.account_type, '') IN ('Asset', 'CostOfGoodsSold', 'Expense', 'OtherExpense') THEN 'debit'";
  const be = 'export const DEBIT_NORMAL_ACCOUNT_TYPES: ReadonlySet<string> = new Set(["Asset", "CostOfGoodsSold", "Expense", "OtherExpense"]);';
  const fe = 'const DEBIT_NORMAL = new Set(["Asset", "CostOfGoodsSold", "Expense", "OtherExpense"]);';
  const bad = [];
  if (parityProblems(sql, be, fe).length) bad.push("matching sets flagged");
  if (!parityProblems(sql, be, fe.replace(', "OtherExpense"', "")).length) bad.push("a frontend set missing OtherExpense passed");
  if (!parityProblems(sql, be.replace('"Expense", ', ""), fe).length) bad.push("a backend set missing Expense passed");
  if (!parityProblems("", be, fe).length) bad.push("an unreadable SQL rule passed");
  if (!backendProblems([{ file: "t.ts", src: "SELECT closing_balance_cents FROM accounting.fn_account_balances_as_of($1)" }]).length) bad.push("raw backend compare passed");
  if (backendProblems([{ file: "t.ts", src: "SELECT closing_balance_cents, normal_balance FROM accounting.fn_account_balances_as_of($1)" }]).length) bad.push("signed backend read flagged");
  if (!frontendProblems([{ file: "p.tsx", src: 'import { fetchAccountBalances } from "../api/coa-list"; x.closing_balance_cents' }]).length) bad.push("raw surface passed");
  if (frontendProblems([{ file: "p.tsx", src: 'import { fetchAccountBalances } from "../api/coa-list"; import { naturalCents } from "../../lib/naturalBalance"; x.closing_balance_cents' }]).length) bad.push("natural surface flagged");
  if (frontendProblems([{ file: "p.tsx", src: 'import { getReclassifyAccountTree } from "../api/reclassify"; picker(tree)' }]).length) bad.push("an account picker flagged");
  if (bad.length) { console.error(`${LABEL} SELFTEST FAILED:\n  - ${bad.join("\n  - ")}`); process.exit(1); }
  console.log(`${LABEL} SELFTEST OK — 9/9 (parity both sides + unreadable rule, raw/signed backend read, raw/natural surface, picker exempt)`);
  process.exit(0);
}
if (process.argv.includes("--selftest")) selftest();

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const ls = (globs) =>
  execFileSync("git", ["ls-files", ...globs], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter((f) => f && !/(\.test\.|__tests__|\/api\/)/.test(f));
const problems = [
  ...parityProblems(read(SQL_FN), read(BE_HELPER), read(FE_HELPER)),
  ...backendProblems(ls(["apps/backend/src/**/*.ts"]).map((file) => ({ file, src: read(file) }))),
  ...frontendProblems(ls(["apps/frontend/src/**/*.ts", "apps/frontend/src/**/*.tsx"]).map((file) => ({ file, src: read(file) }))),
];
if (problems.length) { console.error(`${LABEL} FAIL\n  - ${problems.join("\n  - ")}`); process.exit(1); }
console.log(`${LABEL} OK — one debit-normal set (SQL = backend = frontend); every ledger-balance reader carries the sign; every raw-ledger surface renders natural.`);
