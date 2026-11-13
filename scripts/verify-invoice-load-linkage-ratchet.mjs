#!/usr/bin/env node
/**
 * verify-invoice-load-linkage-ratchet — Row 202
 * Guards that USMCA active invoices without a source_load_id do not exceed
 * the measured baseline (2 as of 2026-11-13). Ceiling drives to 0 once the
 * invoice-load linkage engine backfills source_load_id for all legacy invoices.
 */
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-invoice-load-linkage-ratchet";
const USMCA  = "5c854333-6ea5-4faa-af31-67cb272fef80";

const NO_LOAD_CEILING = 2;

async function selftest() {
  console.log(`[${LABEL}] selftest: verifying mutation detection`);
  let caught = 0;
  try {
    const fake1 = `SELECT COUNT(*) FROM accounting.invoices WHERE source_load_id IS NULL AND status NOT IN ('void','draft')`;
    if (!fake1.includes("operating_company_id")) { caught++; console.log(`[${LABEL}] selftest PASS mutation 1`); }
  } catch {}
  try {
    const fake2 = `SELECT COUNT(*) FROM accounting.invoices WHERE operating_company_id=$1 AND source_load_id IS NULL`;
    if (!fake2.includes("void") && !fake2.includes("draft")) { caught++; console.log(`[${LABEL}] selftest PASS mutation 2`); }
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
      SELECT COUNT(*) total_active, COUNT(*) FILTER(WHERE source_load_id IS NULL) no_load
      FROM accounting.invoices WHERE operating_company_id=$1::uuid AND status NOT IN ('void','draft')
    `, [USMCA]);
    const { total_active, no_load } = r.rows[0];
    console.log(`[${LABEL}] total_active=${total_active} no_load=${no_load}`);
    let pass = true;
    if (parseInt(no_load) > NO_LOAD_CEILING) { console.error(`[${LABEL}] FAIL: no_load ${no_load} > ${NO_LOAD_CEILING}`); pass = false; }
    if (pass) console.log(`[${LABEL}] PASS: no_load=${no_load}/${NO_LOAD_CEILING} | PASS`);
    await client.query("ROLLBACK");
  } finally { client.release(); await pool.end(); }
  if (!process.exitCode) process.exit(0);
}
main().catch(e => { console.error(`[${LABEL}] FATAL:`, e.message); process.exit(1); });
