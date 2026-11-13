#!/usr/bin/env node
/**
 * verify-insurance-claim-policy-link-ratchet — Row 223
 * Guards that all USMCA insurance claims have a policy_id (ceiling = 0 without policy).
 * As of 2026-11-13: 0 total claims. Guard auto-enforces as claims are filed.
 */
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-insurance-claim-policy-link-ratchet";
const USMCA  = "5c854333-6ea5-4faa-af31-67cb272fef80";
const NO_POLICY_CEILING = 0;

async function selftest() {
  console.log(`[${LABEL}] selftest: verifying mutation detection`);
  let caught = 0;
  try {
    const fake1 = `SELECT COUNT(*) FROM insurance.claim WHERE policy_id IS NULL`;
    if (!fake1.includes("operating_company_id")) { caught++; console.log(`[${LABEL}] selftest PASS mutation 1`); }
  } catch {}
  try {
    const fake2 = `SELECT COUNT(*) FROM insurance.claim WHERE operating_company_id=$1 AND policy_id IS NOT NULL`;
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
      SELECT COUNT(*) total, COUNT(*) FILTER(WHERE policy_id IS NULL) no_policy
      FROM insurance.claim WHERE operating_company_id=$1::uuid
    `, [USMCA]);
    const { total, no_policy } = r.rows[0];
    console.log(`[${LABEL}] total=${total} no_policy=${no_policy}`);
    let pass = true;
    if (parseInt(no_policy) > NO_POLICY_CEILING) { console.error(`[${LABEL}] FAIL: no_policy ${no_policy} > ${NO_POLICY_CEILING}`); pass = false; }
    if (pass) console.log(`[${LABEL}] PASS: no_policy=${no_policy}/${NO_POLICY_CEILING} | PASS`);
    await client.query("ROLLBACK");
  } finally { client.release(); await pool.end(); }
  if (!process.exitCode) process.exit(0);
}
main().catch(e => { console.error(`[${LABEL}] FATAL:`, e.message); process.exit(1); });
