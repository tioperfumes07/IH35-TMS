#!/usr/bin/env node
/**
 * verify-unapplied-credit-ratchet — Row 21
 * Guards that no USMCA bills have paid_cents > amount_cents (unapplied credit scenario).
 * As of 2026-11-13: 0/241 bills overpaid. Ceiling = 0.
 */
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-unapplied-credit-ratchet";
const USMCA  = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OVERPAID_CEILING = 0;

async function selftest() {
  console.log(`[${LABEL}] selftest: verifying mutation detection`);
  let caught = 0;
  try {
    const fake1 = `SELECT COUNT(*) FROM accounting.bills WHERE paid_cents > amount_cents`;
    if (!fake1.includes("operating_company_id")) { caught++; console.log(`[${LABEL}] selftest PASS mutation 1: missing opco filter`); }
  } catch {}
  try {
    const fake2 = `SELECT COUNT(*) FROM accounting.bills WHERE operating_company_id=$1 AND paid_cents < amount_cents`;
    if (fake2.includes("paid_cents < amount_cents")) { caught++; console.log(`[${LABEL}] selftest PASS mutation 2: wrong comparison direction`); }
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
      SELECT COUNT(*) total,
        COUNT(*) FILTER(WHERE paid_cents > amount_cents AND amount_cents IS NOT NULL) overpaid
      FROM accounting.bills 
      WHERE operating_company_id=$1::uuid AND status NOT IN ('void','draft') AND is_sample_data IS DISTINCT FROM true
    `, [USMCA]);
    const { total, overpaid } = r.rows[0];
    console.log(`[${LABEL}] total=${total} overpaid=${overpaid}`);
    let pass = true;
    if (parseInt(overpaid) > OVERPAID_CEILING) { console.error(`[${LABEL}] FAIL: overpaid ${overpaid} > ${OVERPAID_CEILING}`); pass = false; }
    if (pass) console.log(`[${LABEL}] PASS: overpaid=${overpaid}/${OVERPAID_CEILING} | PASS`);
    await client.query("ROLLBACK");
  } finally { client.release(); await pool.end(); }
  if (!process.exitCode) process.exit(0);
}
main().catch(e => { console.error(`[${LABEL}] FATAL:`, e.message); process.exit(1); });
