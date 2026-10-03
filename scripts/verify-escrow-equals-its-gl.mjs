#!/usr/bin/env node
/**
 * ESCROW EQUALS ITS GL (Lead order "KILL THE SECOND SYSTEM. THE LEDGER IS THE BALANCE." — CC-1, migration 202615350300).
 *
 * The GL account that owns a driver's escrow: his own 2100-00-<nnn> sub-account. Every escrow number a screen, report,
 * API or service shows is DERIVED from that account's postings (driver_finance.v_driver_escrow_balance) — never read
 * from a stored column. (Measured 2026-10-03: the stored copies disagreed with the GL on 10-11 of 45 drivers.)
 *
 * STATIC:
 *   1. No backend SELECT reads a stored escrow balance — accounting.escrow_accounts.balance_cents,
 *      driver_finance.escrow_balances.current_balance_cents / total_held_cents / total_released_cents,
 *      driver_finance.escrow_ledger.running_balance_cents — outside WRITER_DEBT (the writers step 2 retires; shrink-only,
 *      each named: a file that stops touching the columns must leave the list).
 * LIVE (fails closed without a database), UNSCOPED:
 *   2. every LIVE 2100-00-<nnn> sub-account appears exactly once in v_driver_escrow_balance (row count = live sub-account
 *      count) — an unmapped live sub-account is driver money no screen can see;
 *   3. a view row on a DEACTIVATED sub-account carries no balance;
 *   4. every view balance equals an independent sum of that account's posted lines.
 * Ceiling 0. No baseline file: the only debt is the writer list below, committed here.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

export const REQUIRES_LIVE_DB = "escrow balances are live money — fails closed without a database";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-escrow-equals-its-gl";

/** Files that still WRITE (and read back to write) the stored escrow columns — retired in step 2. Shrink-only. */
export const WRITER_DEBT = {
  "apps/backend/src/settlements/approval.service.ts": "upserts escrow_balances and reads it back for the ledger running balance — step 2",
  "apps/backend/src/driver-finance/settlement-payrun-close.service.ts": "upserts escrow_balances / ledger running balance at close — step 2",
  "apps/backend/src/driver-finance/historical-escrow-backfill.service.ts": "upserts escrow_balances for history backfill — step 2",
  "apps/backend/src/driver-finance/escrow-forfeit.service.ts": "decrements escrow_balances and writes the ledger running balance — step 2",
  "apps/backend/src/driver-finance/settlement-payrun-subledger-unwind.service.ts": "reverses escrow_balances on unwind — step 2",
};

const stripTs = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const VIEW = /v_driver_escrow_balance|v_escrow_account_balance/i;
/** Each SQL statement lives in its own template literal; judge statement by statement. */
const statements = (src) => src.split("`").filter((_, i) => i % 2 === 1);
/** A statement that READS a stored escrow balance. */
export function readsStoredBalance(t) {
  if (/\bINSERT\s+INTO\s+accounting\.escrow_accounts\b/i.test(t)) return false;
  if (/\b(FROM|JOIN)\s+accounting\.escrow_accounts\b/i.test(t) && /\bbalance_cents\b/i.test(t) && !VIEW.test(t) && /\bSELECT\b/i.test(t)) return true;
  if (/\b(FROM|JOIN)\s+driver_finance\.escrow_balances\b/i.test(t) && /\b(current_balance_cents|total_held_cents|total_released_cents)\b/i.test(t)) return true;
  if (/\b(FROM|JOIN)\s+driver_finance\.escrow_ledger\b/i.test(t) && /\bSELECT\b[\s\S]*\brunning_balance_cents\b/i.test(t)) return true;
  return false;
}
/** A statement that WRITES (or reads back to write) a stored escrow balance. */
export function touchesStoredBalance(t) {
  return /driver_finance\.escrow_balances\b/i.test(t) && /\b(current_balance_cents|total_held_cents|total_released_cents)\b/i.test(t)
    || /driver_finance\.escrow_ledger\b/i.test(t) && /\brunning_balance_cents\b/i.test(t)
    || /accounting\.escrow_accounts\b/i.test(t) && /\bbalance_cents\b/i.test(t) && !VIEW.test(t);
}

export function staticFailures({ files, read }) {
  const out = [];
  const touching = [];
  for (const f of files) {
    const st = statements(stripTs(read(f)));
    if (st.some(touchesStoredBalance)) touching.push(f);
    if (!WRITER_DEBT[f] && st.some(readsStoredBalance)) {
      out.push(`RULE 1: ${f} reads a STORED escrow balance — read driver_finance.v_driver_escrow_balance (the 2100-00-<nnn> GL balance) instead.`);
    }
  }
  for (const f of Object.keys(WRITER_DEBT)) {
    if (!touching.includes(f)) out.push(`WRITER DEBT RATCHET: ${f} no longer touches a stored escrow balance — remove it from WRITER_DEBT.`);
  }
  return out;
}

export function liveFailures({ liveSubaccounts, viewRows, recompute }) {
  const out = [];
  const byAccount = new Map();
  for (const r of viewRows) byAccount.set(r.coa_account_id, (byAccount.get(r.coa_account_id) ?? 0) + 1);
  for (const s of liveSubaccounts) {
    const n = byAccount.get(s.id) ?? 0;
    if (n !== 1) out.push(`RULE 2: live sub-account ${s.company} ${s.account_number} appears ${n} time(s) in v_driver_escrow_balance (must be exactly 1).`);
  }
  for (const r of viewRows) {
    if (r.deactivated && Number(r.balance_cents) !== 0) out.push(`RULE 3: deactivated sub-account ${r.account_number} still carries ${r.balance_cents} cents of driver escrow.`);
    const g = recompute.get(r.coa_account_id) ?? 0;
    if (Number(r.balance_cents) !== Number(g)) out.push(`RULE 4: ${r.account_number} view ${r.balance_cents} != posted lines ${g}.`);
  }
  return out;
}

function backendFiles() {
  const r = spawnSync("git", ["ls-files", "apps/backend/src"], { cwd: ROOT, encoding: "utf8" });
  return (r.stdout || "").split("\n").filter((f) => /\.ts$/.test(f) && !/__tests__|\.test\.ts$/.test(f));
}

export function run() {
  return staticFailures({ files: backendFiles(), read: (f) => (existsSync(resolve(ROOT, f)) ? readFileSync(resolve(ROOT, f), "utf8") : "") });
}

async function measure(client) {
  await client.query("BEGIN READ ONLY");
  await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
  const live = await client.query(`
    SELECT a.id, c.code AS company, a.account_number
      FROM catalogs.accounts a JOIN org.companies c ON c.id = a.operating_company_id
     WHERE a.account_number LIKE '2100-00-%' AND a.deactivated_at IS NULL`);
  const view = await client.query(`
    SELECT v.coa_account_id, v.account_number, v.balance_cents, (a.deactivated_at IS NOT NULL) AS deactivated
      FROM driver_finance.v_driver_escrow_balance v JOIN catalogs.accounts a ON a.id = v.coa_account_id`);
  const rec = await client.query(`
    SELECT p.account_id, sum(CASE WHEN p.debit_or_credit = 'credit' THEN p.amount_cents ELSE -p.amount_cents END)::bigint AS bal
      FROM accounting.journal_entry_postings p JOIN accounting.journal_entries j ON j.id = p.journal_entry_uuid AND j.status = 'posted'
     WHERE p.account_id IN (SELECT coa_account_id FROM driver_finance.v_driver_escrow_balance)
     GROUP BY 1`);
  await client.query("ROLLBACK");
  return { liveSubaccounts: live.rows, viewRows: view.rows, recompute: new Map(rec.rows.map((r) => [r.account_id, Number(r.bal)])) };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) {
    const debtFiles = Object.keys(WRITER_DEBT);
    const fake = Object.fromEntries(debtFiles.map((f) => [f, "q(`SELECT current_balance_cents FROM driver_finance.escrow_balances`)"]));
    const files = [...debtFiles, "apps/backend/src/x.ts", "apps/backend/src/y.ts"];
    const reader = (extra) => (f) => (f === "apps/backend/src/x.ts" ? extra : fake[f] ?? "SELECT 1");
    const live = { liveSubaccounts: [{ id: "a1", company: "USMCA", account_number: "2100-00-001" }], viewRows: [{ coa_account_id: "a1", account_number: "2100-00-001", balance_cents: 500, deactivated: false }], recompute: new Map([["a1", 500]]) };
    const cases = [
      ["clean tree passes", staticFailures({ files, read: reader("q(`SELECT ea.id, vb.balance_cents FROM accounting.escrow_accounts ea JOIN driver_finance.v_driver_escrow_balance vb ON 1=1`)") }).length === 0],
      ["a new stored-balance reader fails", staticFailures({ files, read: reader("q(`SELECT ea.balance_cents FROM accounting.escrow_accounts ea`)") }).some((f) => f.startsWith("RULE 1"))],
      ["joining escrow_balances fails", staticFailures({ files, read: reader("q(`SELECT eb.current_balance_cents FROM x JOIN driver_finance.escrow_balances eb ON 1=1`)") }).some((f) => f.startsWith("RULE 1"))],
      ["a writer that stopped must leave the list", staticFailures({ files, read: (f) => (f === debtFiles[0] ? "q(`SELECT 1`)" : reader("")(f)) }).some((f) => f.startsWith("WRITER DEBT"))],
      ["live clean passes", liveFailures(live).length === 0],
      ["unmapped live sub-account fails", liveFailures({ ...live, viewRows: [] }).some((f) => f.startsWith("RULE 2"))],
      ["double-mapped sub-account fails", liveFailures({ ...live, viewRows: [...live.viewRows, ...live.viewRows] }).some((f) => f.startsWith("RULE 2"))],
      ["view != postings fails", liveFailures({ ...live, recompute: new Map([["a1", 400]]) }).some((f) => f.startsWith("RULE 4"))],
      ["dead account with money fails", liveFailures({ ...live, viewRows: [{ ...live.viewRows[0], deactivated: true }] }).some((f) => f.startsWith("RULE 3"))],
    ];
    for (const [n, ok] of cases) console.log(`  ${ok ? "✓" : "✗"} ${n}`);
    const bad = cases.filter(([, ok]) => !ok).length;
    console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
    process.exit(bad ? 1 : 0);
  }
  const sf = run();
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    const hasView = (await client.query(`SELECT to_regclass('driver_finance.v_driver_escrow_balance') IS NOT NULL AS ok`)).rows[0].ok;
    let lf = [];
    let summary = "view pending deploy (202615350300 not applied on this database) — static rules only";
    if (hasView) {
      const m = await measure(client);
      lf = liveFailures(m);
      summary = `${m.liveSubaccounts.length} live 2100-00-<nnn> sub-accounts, each exactly once in v_driver_escrow_balance; every balance equals its posted lines`;
    }
    const all = [...sf, ...lf];
    if (all.length) { console.error(`${LABEL}: FAIL\n  ${all.join("\n  ")}`); process.exitCode = 1; }
    else console.log(`${LABEL}: OK — ${summary}; no backend reader of a stored escrow balance (writer debt ${Object.keys(WRITER_DEBT).length}, retired in step 2).`);
  } finally {
    client.release?.();
    await pool?.end?.();
  }
}
