#!/usr/bin/env node
/**
 * ROW-73 — driver pay accrual sweep must be imported + initialized in index.ts.
 *
 * ROOT CAUSE: fireDriverPayAccrual in delivery-evidence-latch runs once inline and swallows
 * failures. Three USMCA delivered loads (13663, 13688, 13687) never got accrued_bill_id set.
 * FIX: driver-pay-accrual-sweep.cron.ts runs at boot + every 15 min and catches missed bills.
 *
 * Usage: node scripts/verify-driver-pay-accrual-sweep-wired.mjs [--selftest]
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-pay-accrual-sweep-wired";

const INDEX = "apps/backend/src/index.ts";
const CRON_FILE = "apps/backend/src/accounting/driver-pay-accrual-sweep.cron.ts";
const SERVICE_FILE = "apps/backend/src/accounting/driver-pay-accrual-sweep.service.ts";

function check(readFile) {
  const failures = [];

  const cronSrc = readFile(CRON_FILE);
  if (cronSrc === null) failures.push(`${CRON_FILE}: not found — ROW-73 cron file missing`);
  else {
    if (!/initializeDriverPayAccrualSweepCron/.test(cronSrc))
      failures.push(`${CRON_FILE}: must export initializeDriverPayAccrualSweepCron`);
    if (!/node-cron/.test(cronSrc) && !/\*\/15 \* \* \* \*/.test(cronSrc))
      failures.push(`${CRON_FILE}: must schedule every 15 min via node-cron`);
  }

  const svcSrc = readFile(SERVICE_FILE);
  if (svcSrc === null) failures.push(`${SERVICE_FILE}: not found — ROW-73 service file missing`);
  else {
    if (!/runDriverPayAccrualSweep/.test(svcSrc))
      failures.push(`${SERVICE_FILE}: must export runDriverPayAccrualSweep`);
    if (!/due_date_basis\s*=\s*'delivered'/.test(svcSrc) && !/due_date_basis = 'delivered'/.test(svcSrc))
      failures.push(`${SERVICE_FILE}: must filter due_date_basis='delivered'`);
    if (!/accrued_bill_id IS NULL/.test(svcSrc))
      failures.push(`${SERVICE_FILE}: must filter accrued_bill_id IS NULL`);
  }

  const indexSrc = readFile(INDEX);
  if (indexSrc === null) failures.push(`${INDEX}: not found`);
  else {
    if (!/accounting\/driver-pay-accrual-sweep\.cron/.test(indexSrc))
      failures.push(`${INDEX}: must import from accounting/driver-pay-accrual-sweep.cron (ROW-73)`);
    if (!/initializeDriverPayAccrualSweepCron\s*\(app\)/.test(indexSrc))
      failures.push(`${INDEX}: must call initializeDriverPayAccrualSweepCron(app) at startup (ROW-73)`);
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const goodIndex = `import { initializeDriverPayAccrualSweepCron } from "./accounting/driver-pay-accrual-sweep.cron.js";
  initializeDriverPayAccrualSweepCron(app);`;
  const goodCron = `import cron from "node-cron"; cron.schedule("*/15 * * * *", ...); export function initializeDriverPayAccrualSweepCron(app) {}`;
  const goodSvc = `due_date_basis = 'delivered' accrued_bill_id IS NULL export function runDriverPayAccrualSweep() {}`;

  const files = {
    [INDEX]: goodIndex,
    [CRON_FILE]: goodCron,
    [SERVICE_FILE]: goodSvc,
  };
  const gf = check((f) => files[f] ?? null);
  if (gf.length) { console.error(`${LABEL} selftest FAIL — good fixtures should pass: ${gf.join("; ")}`); process.exit(1); }

  const badIndex = `// no driver-pay-accrual-sweep`;
  const bf = check((f) => (f === INDEX ? badIndex : files[f] ?? null));
  if (!bf.some((e) => /driver-pay-accrual-sweep/.test(e))) { console.error(`${LABEL} selftest FAIL — bad index should be caught`); process.exit(1); }

  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

const failures = check((rel) => {
  const p = path.join(ROOT, rel);
  try { return readFileSync(p, "utf8"); } catch { return null; }
});
if (failures.length) {
  console.error(`[${LABEL}] FAILED:`);
  for (const f of failures) console.error("  ✗", f);
  process.exit(1);
}
console.log(`[${LABEL}] PASS — driver pay accrual sweep wired (ROW-73)`);
