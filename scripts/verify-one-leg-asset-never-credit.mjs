#!/usr/bin/env node
// ROUND 352 F-2 / F-3 — "an entry posting one leg": an asset that holds money cannot carry a credit balance.
// Static: migration 202615330600 refuses, at commit, a non-reversal CREDIT that leaves an account bound to
// undeposited_funds (1090) or fuel_wallet_relay (1295) negative; reversals are exempt (the governed purge reverses GL).
// Live (DATABASE_URL): every account bound to either role has a balance >= 0, EXCEPT the named debt below — and a debt
// entry may only shrink (its balance may not fall below the figure recorded here). Debt ceiling for anything new: 0.
// The two debt entries are purge population: they clear with the governed purge (ROUND 352 gate 4 -> 5).
// --selftest plants each regression.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
export const REQUIRES_LIVE_DB = "reads posted balances of the accounts bound to undeposited_funds / fuel_wallet_relay";

const LABEL = "verify-one-leg-asset-never-credit";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIG = "db/migrations/202615330600_one_leg_asset_accounts_never_credit.sql";
const ROLES = ["undeposited_funds", "fuel_wallet_relay"];
/** NAMED DEBT (committed, shrink-only): company code + account number -> floor in cents (the balance measured 2026-10-03). */
export const DEBT = new Map([
  ["USMCA:1090", { floor: -15173634, why: "two manual TB-close sweeps (ACCT-F20260925i/j) moved a balance whose receipts were later reversed; purge population" }],
  ["USMCA:1295", { floor: -3383980, why: "74 Relay fuel spends posted with no funding: the Relay top-up (card purchase on 1000) never posted; purge population" }],
]);

export function check(sql) {
  const f = [];
  if (!/CREATE CONSTRAINT TRIGGER trg_refuse_one_leg_asset_credit[\s\S]*?DEFERRABLE INITIALLY DEFERRED/.test(sql)) f.push("trigger missing or not deferred");
  if (!/r\.role IN \('undeposited_funds', 'fuel_wallet_relay'\)/.test(sql)) f.push("the guarded role list changed");
  if (!/je\.reverses_je_id IS NOT NULL/.test(sql)) f.push("reversals are no longer exempt — the governed purge could not unwind");
  if (!/IF v_balance < 0 THEN/.test(sql)) f.push("the negative-balance refusal is gone");
  if (!/'fuel_wallet_relay'/.test(sql) || !/INSERT INTO accounting\.chart_of_accounts_roles/.test(sql)) f.push("fuel_wallet_relay is no longer declared");
  return f.map((x) => `${MIG}: ${x}`);
}

export function judge(rows) {
  const f = [];
  for (const r of rows) {
    const key = `${r.code}:${r.account_number}`;
    const bal = Number(r.balance_cents);
    const debt = DEBT.get(key);
    if (debt) {
      if (bal < debt.floor) f.push(`${key} is ${bal} cents, below its recorded debt floor ${debt.floor} — the debt grew`);
    } else if (bal < 0) {
      f.push(`${key} (${r.role}) holds a credit balance of ${bal} cents — an asset holding money cannot be negative`);
    }
  }
  return f;
}

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

if (process.argv.includes("--selftest")) {
  const sql = read(MIG);
  const fails = [];
  if (check(sql).length) fails.push(`tree not clean: ${check(sql).join("; ")}`);
  for (const [name, planted] of [
    ["reversal exemption removed", sql.replace("je.reverses_je_id IS NOT NULL OR ", "")],
    ["trigger made immediate", sql.replace("DEFERRABLE INITIALLY DEFERRED", "")],
    ["refusal removed", sql.replace("IF v_balance < 0 THEN", "IF false THEN")],
  ]) if (check(planted).length === 0) fails.push(`plant escaped: ${name}`);
  if (judge([{ code: "TRANSP", account_number: "QBO-168", role: "undeposited_funds", balance_cents: -1 }]).length !== 1) fails.push("a new negative account not caught");
  if (judge([{ code: "USMCA", account_number: "1090", role: "undeposited_funds", balance_cents: -15173635 }]).length !== 1) fails.push("debt growth not caught");
  if (judge([{ code: "USMCA", account_number: "1090", role: "undeposited_funds", balance_cents: -15173634 }]).length !== 0) fails.push("debt at its floor flagged");
  if (fails.length) { console.error(`${LABEL} --selftest FAIL: ${fails.join("; ")}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS 6/6`);
  process.exit(0);
}

const fails = check(read(MIG));
if (fails.length) { console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`); process.exit(1); }
if (!process.env.DATABASE_URL) { console.error(`${LABEL}: FAIL — static passed; the live check needs DATABASE_URL`); process.exit(1); }
const { default: pg } = await import("pg");
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000, statement_timeout: 30000 });
try {
  await c.connect();
  await c.query("BEGIN READ ONLY");
  await c.query("SET LOCAL app.bypass_rls = 'lucia'");
  const rows = (await c.query(`
    SELECT co.code, a.account_number, r.role,
           (SELECT COALESCE(sum(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END), 0)::bigint
              FROM accounting.journal_entry_postings p JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid AND je.status = 'posted'
             WHERE p.account_id = a.id) AS balance_cents
      FROM accounting.chart_of_accounts_roles r
      JOIN catalogs.accounts a ON a.id = r.account_id
      JOIN org.companies co ON co.id = r.operating_company_id
     WHERE r.is_active AND r.role = ANY($1::text[])
     GROUP BY co.code, a.account_number, r.role, a.id`, [ROLES])).rows;
  await c.query("ROLLBACK");
  const bad = judge(rows);
  if (bad.length) { console.error(`${LABEL}: FAIL\n  ${bad.join("\n  ")}`); process.exit(1); }
  const debtNow = rows.filter((r) => DEBT.has(`${r.code}:${r.account_number}`)).map((r) => `${r.code}:${r.account_number} ${r.balance_cents}`);
  console.log(`${LABEL}: PASS — ${rows.length} guarded account binding(s); no new credit balance; named debt within its floor (${debtNow.join("; ") || "none bound yet"})`);
} catch (err) {
  console.error(`${LABEL}: FAIL — live check could not run: ${err.message}`);
  process.exit(1);
} finally {
  await c.end().catch(() => {});
}
