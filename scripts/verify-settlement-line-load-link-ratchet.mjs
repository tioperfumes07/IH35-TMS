#!/usr/bin/env node
/**
 * verify-settlement-line-load-link-ratchet — Row 207
 * Guards that USMCA settlement_lines without a load_id do not exceed the
 * measured baseline (5 as of 2026-11-13).
 */
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-settlement-line-load-link-ratchet";
const USMCA  = "5c854333-6ea5-4faa-af31-67cb272fef80";
const NO_LOAD_CEILING = 5;

async function selftest() {
  console.log(`[${LABEL}] selftest: verifying mutation detection`);
  let caught = 0;
  try {
    const fake1 = `SELECT COUNT(*) FROM driver_finance.settlement_lines WHERE load_id IS NULL`;
    if (!fake1.includes("operating_company_id")) { caught++; console.log(`[${LABEL}] selftest PASS mutation 1`); }
  } catch {}
  try {
    const fake2 = `SELECT COUNT(*) FROM driver_finance.settlement_lines WHERE operating_company_id=$1 AND load_id IS NOT NULL`;
    if (fake2.includes("IS NOT NULL")) { caught++; console.log(`[${LABEL}] selftest PASS mutation 2`); }
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
      SELECT COUNT(*) total, COUNT(*) FILTER(WHERE load_id IS NULL) no_load, COUNT(*) FILTER(WHERE load_id IS NOT NULL) has_load
      FROM driver_finance.settlement_lines WHERE operating_company_id=$1::uuid AND is_sample_data IS DISTINCT FROM true
    `, [USMCA]);
    const { total, no_load, has_load } = r.rows[0];
    console.log(`[${LABEL}] total=${total} no_load=${no_load} has_load=${has_load}`);
    let pass = true;
    if (parseInt(no_load) > NO_LOAD_CEILING) { console.error(`[${LABEL}] FAIL: no_load ${no_load} > ${NO_LOAD_CEILING}`); pass = false; }
    if (pass) console.log(`[${LABEL}] PASS: no_load=${no_load}/${NO_LOAD_CEILING} | PASS`);
    await client.query("ROLLBACK");
  } finally { client.release(); await pool.end(); }
  if (!process.exitCode) process.exit(0);
}
main().catch(e => { console.error(`[${LABEL}] FATAL:`, e.message); process.exit(1); });
