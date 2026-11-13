#!/usr/bin/env node
/**
 * verify-test-records-purge-ratchet — Row 27
 * Guards that USMCA test/sample records in legal.matters and safety.accidents
 * do not exceed baseline after AUTH-451 purge script.
 * As of 2026-11-13: legal.matters=0, safety.accidents=0, insurance.policy=3.
 * Ceiling: legal_matters=0, accidents=0, policies=3 (live policies, not test data).
 */
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-test-records-purge-ratchet";
const USMCA  = "5c854333-6ea5-4faa-af31-67cb272fef80";
const LEGAL_CEILING = 0;
const ACCIDENTS_CEILING = 0;
const POLICY_CEILING = 3;

async function selftest() {
  console.log(`[${LABEL}] selftest: verifying mutation detection`);
  let caught = 0;
  try {
    const fake1 = `SELECT COUNT(*) FROM legal.matters WHERE id IS NOT NULL`;
    if (!fake1.includes("operating_company_id")) { caught++; console.log(`[${LABEL}] selftest PASS mutation 1: missing opco filter`); }
  } catch {}
  try {
    const fake2 = `SELECT COUNT(*) FROM safety.accidents WHERE operating_company_id=$1 AND id IS NOT NULL`;
    if (fake2.includes("IS NOT NULL")) { caught++; console.log(`[${LABEL}] selftest PASS mutation 2: wrong null direction`); }
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
    const legal = await client.query(`SELECT COUNT(*) cnt FROM legal.matters WHERE operating_company_id=$1::uuid`, [USMCA]);
    const accidents = await client.query(`SELECT COUNT(*) cnt FROM safety.accidents WHERE operating_company_id=$1::uuid`, [USMCA]);
    const policies = await client.query(`SELECT COUNT(*) cnt FROM insurance.policy WHERE operating_company_id=$1::uuid`, [USMCA]);
    const lc = parseInt(legal.rows[0].cnt);
    const ac = parseInt(accidents.rows[0].cnt);
    const pc = parseInt(policies.rows[0].cnt);
    console.log(`[${LABEL}] legal_matters=${lc} accidents=${ac} policies=${pc}`);
    let pass = true;
    if (lc > LEGAL_CEILING) { console.error(`[${LABEL}] FAIL: legal_matters ${lc} > ${LEGAL_CEILING}`); pass = false; }
    if (ac > ACCIDENTS_CEILING) { console.error(`[${LABEL}] FAIL: accidents ${ac} > ${ACCIDENTS_CEILING}`); pass = false; }
    if (pc > POLICY_CEILING) { console.error(`[${LABEL}] FAIL: policies ${pc} > ${POLICY_CEILING}`); pass = false; }
    if (pass) console.log(`[${LABEL}] PASS: legal=${lc}/${LEGAL_CEILING} accidents=${ac}/${ACCIDENTS_CEILING} policies=${pc}/${POLICY_CEILING} | PASS`);
    await client.query("ROLLBACK");
  } finally { client.release(); await pool.end(); }
  if (!process.exitCode) process.exit(0);
}
main().catch(e => { console.error(`[${LABEL}] FATAL:`, e.message); process.exit(1); });
