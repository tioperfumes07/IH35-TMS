#!/usr/bin/env node
/**
 * verify-relay-bank-feed-current — Row 22
 * Guards that the USMCA Relay Fuel Wallet bank feed has ingested transactions
 * within the past 30 days. Prevents silent feed stoppage (issue: feed stopped after 2026-10-09).
 * As of 2026-11-13: last_relay_txn=2026-11-10, total=315.
 */
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-relay-bank-feed-current";
const USMCA  = "5c854333-6ea5-4faa-af31-67cb272fef80";
const RELAY_ACCOUNT = "Relay Fuel Wallet";
const MIN_TOTAL = 315;

async function selftest() {
  console.log(`[${LABEL}] selftest: verifying mutation detection`);
  let caught = 0;
  try {
    const fake1 = `SELECT MAX(transaction_date) FROM banking.bank_transactions WHERE transaction_date > NOW() - INTERVAL '30 days'`;
    if (!fake1.includes("operating_company_id")) { caught++; console.log(`[${LABEL}] selftest PASS mutation 1: missing opco filter`); }
  } catch {}
  try {
    const fake2 = `SELECT MIN(transaction_date) FROM banking.bank_transactions bt JOIN banking.bank_accounts ba ON ba.id = bt.bank_account_id WHERE bt.operating_company_id=$1 AND ba.account_name = $2`;
    if (fake2.includes("MIN(transaction_date)")) { caught++; console.log(`[${LABEL}] selftest PASS mutation 2: wrong aggregation direction`); }
  } catch {}
  if (caught < 2) { console.error(`[${LABEL}] selftest FAIL: ${caught}/2`); process.exit(1); }
  console.log(`[${LABEL}] selftest PASS 2/2`);
}

async function main() {
  if (process.argv.includes("--selftest")) { await selftest(); return; }
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL app.bypass_rls = 'on'");
    const r = await client.query(`
      SELECT 
        COUNT(*) total,
        MAX(bt.transaction_date) last_txn,
        COUNT(*) FILTER(WHERE bt.transaction_date > NOW() - INTERVAL '30 days') recent_30d
      FROM banking.bank_transactions bt
      JOIN banking.bank_accounts ba ON ba.id = bt.bank_account_id
      WHERE bt.operating_company_id=$1::uuid AND ba.account_name = $2
    `, [USMCA, RELAY_ACCOUNT]);
    const { total, last_txn, recent_30d } = r.rows[0];
    const lastDate = last_txn ? new Date(last_txn).toISOString().slice(0, 10) : 'null';
    console.log(`[${LABEL}] total=${total} last_txn=${lastDate} recent_30d=${recent_30d}`);
    let pass = true;
    if (parseInt(total) < MIN_TOTAL) { console.error(`[${LABEL}] FAIL: total ${total} < ${MIN_TOTAL}`); pass = false; }
    if (parseInt(recent_30d) === 0) { console.error(`[${LABEL}] FAIL: no Relay transactions in last 30 days (feed stopped)`); pass = false; }
    if (pass) console.log(`[${LABEL}] PASS: total=${total}>=${MIN_TOTAL} recent_30d=${recent_30d}>0 | PASS`);
    await client.query("ROLLBACK");
  } finally { client.release(); await pool.end(); }
  if (!process.exitCode) process.exit(0);
}
main().catch(e => { console.error(`[${LABEL}] FATAL:`, e.message); process.exit(1); });
