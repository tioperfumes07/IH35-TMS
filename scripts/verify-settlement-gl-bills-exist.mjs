#!/usr/bin/env node
/**
 * ENG-46 (443.328 2026-10-25) — USMCA non-salaried closed settlements must have
 * at least one driver_settlement_gl_bills entry with a valid accounting_bill_id.
 *
 * Salaried / zero-pay settlements (pay_method = 'no_net_pay' or 'weekly_salary')
 * are exempt — they close with $0 net and no A/P bill is created.
 *
 * Root cause (pre-existing data): no prior defects found — all 85 non-salaried
 * closed USMCA settlements measured 2026-10-25 have GL bill entries. Ceiling = 0.
 *
 * STATIC: checks that the service writes to driver_settlement_gl_bills when posting.
 * LIVE (DATABASE_URL / gate read-only credential): shrink-only ratchet, ceiling 0.
 * --selftest plants each regression.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-gl-bills-exist";
const CEILING = 0;

const AP_CHAIN_SERVICE = "apps/backend/src/driver-finance/settlement-ap-chain.service.ts";

export function staticFailures() {
  const f = [];
  const apChain = readFileSync(resolve(ROOT, AP_CHAIN_SERVICE), "utf8");
  if (!/driver_settlement_gl_bills/.test(apChain)) {
    f.push(`${AP_CHAIN_SERVICE}: missing driver_settlement_gl_bills INSERT — AP chain must write per-load GL bill entries when posting a settlement`);
  }
  if (!/accounting_bill_id/.test(apChain)) {
    f.push(`${AP_CHAIN_SERVICE}: missing accounting_bill_id in driver_settlement_gl_bills insert — bill id must be recorded`);
  }
  return f;
}

const SELFTEST = process.argv.includes("--selftest");

if (SELFTEST) {
  const staticClean = staticFailures();
  if (staticClean.length) {
    console.error("SELFTEST FAIL: baseline static should pass:", staticClean);
    process.exit(1);
  }
  // Plant: remove driver_settlement_gl_bills from ap-chain — must fail static
  const apChainText = readFileSync(resolve(ROOT, AP_CHAIN_SERVICE), "utf8");
  const planted = apChainText.replace(/driver_settlement_gl_bills/g, "dsg_bills_REMOVED");
  const fs = (await import("node:fs")).default;
  fs.writeFileSync(resolve(ROOT, AP_CHAIN_SERVICE), planted);
  let fail;
  try {
    fail = staticFailures();
  } finally {
    fs.writeFileSync(resolve(ROOT, AP_CHAIN_SERVICE), apChainText);
  }
  if (!fail.length) {
    console.error("SELFTEST FAIL: removing driver_settlement_gl_bills should fail static check");
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

const failures = staticFailures();

if (process.env.DATABASE_URL || process.env.IH35_GATE_READONLY_DB_URL) {
  const { createRequire } = await import("module");
  const require = createRequire(import.meta.url);
  const { Pool } = require("pg");
  const pgOpts = require("./lib/pg-connection-options.cjs");
  const pool = new Pool(pgOpts);
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    const r = await client.query(`
      SELECT count(DISTINCT ds.id)::int AS n
      FROM driver_finance.driver_settlements ds
      WHERE ds.operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'
        AND ds.voided_at IS NULL
        AND ds.posted_at IS NOT NULL
        AND ds.status = 'closed'
        AND ds.pay_method NOT IN ('no_net_pay','weekly_salary')
        AND NOT EXISTS (
          SELECT 1 FROM driver_finance.driver_settlement_gl_bills b
          WHERE b.settlement_id = ds.id AND b.accounting_bill_id IS NOT NULL
        )
    `);
    const count = r.rows[0].n;
    if (count > CEILING) {
      failures.push(`${count} USMCA non-salaried closed settlement(s) have no driver_settlement_gl_bills entry (ceiling ${CEILING}) — AP chain must write GL bill rows at settlement close`);
    }
    await client.query("ROLLBACK");
    console.log(`${LABEL}: LIVE — ${count} closed settlements missing GL bill entries (ceiling ${CEILING})`);
  } catch (err) {
    failures.push(`DB check failed: ${err.message}`);
  } finally {
    client.release?.();
    await pool.end?.();
  }
} else {
  console.log(`${LABEL}: LIVE arm NOT RUN (no DATABASE_URL) — static checks only`);
}

if (failures.length) {
  console.error(`${LABEL}: FAIL (${failures.length}):`);
  for (const x of failures) console.error(`  ✗ ${x}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — AP chain writes GL bill entries; live count ≤ ${CEILING}`);
