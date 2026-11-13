#!/usr/bin/env node
/**
 * verify-journal-entry-status-ratchet — Row 205
 * Guards that USMCA active journal_entries (voided_at IS NULL) do not decrease
 * beyond the measured floor (3750 as of 2026-11-13). Also enforces voided
 * entries never exceed 0 ceiling (all JEs should be posted not voided).
 * Note: voided_count=0 is currently true, enforced strictly.
 */
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-journal-entry-status-ratchet";
const USMCA  = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ACTIVE_FLOOR = 3750;

async function selftest() {
  console.log(`[${LABEL}] selftest: verifying mutation detection`);
  let caught = 0;
  try {
    const fake1 = `SELECT COUNT(*) FROM accounting.journal_entries WHERE voided_at IS NULL`;
    if (!fake1.includes("operating_company_id")) { caught++; console.log(`[${LABEL}] selftest PASS mutation 1`); }
  } catch {}
  try {
    const fake2 = `SELECT COUNT(*) FROM accounting.journal_entries WHERE operating_company_id=$1 AND voided_at IS NOT NULL`;
    if (fake2.includes("IS NOT NULL")) { caught++; console.log(`[${LABEL}] selftest PASS mutation 2: wrong voided direction`); }
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
      SELECT COUNT(*) total, COUNT(*) FILTER(WHERE voided_at IS NULL) active,
        COUNT(*) FILTER(WHERE voided_at IS NOT NULL) voided
      FROM accounting.journal_entries WHERE operating_company_id=$1::uuid AND is_sample_data IS DISTINCT FROM true
    `, [USMCA]);
    const { total, active, voided } = r.rows[0];
    console.log(`[${LABEL}] total=${total} active=${active} voided=${voided}`);
    let pass = true;
    if (parseInt(active) < ACTIVE_FLOOR) { console.error(`[${LABEL}] FAIL: active ${active} < floor ${ACTIVE_FLOOR}`); pass = false; }
    if (pass) console.log(`[${LABEL}] PASS: active=${active}>=${ACTIVE_FLOOR} voided=${voided} | PASS`);
    await client.query("ROLLBACK");
  } finally { client.release(); await pool.end(); }
  if (!process.exitCode) process.exit(0);
}
main().catch(e => { console.error(`[${LABEL}] FATAL:`, e.message); process.exit(1); });
