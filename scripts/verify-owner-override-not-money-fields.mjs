#!/usr/bin/env node
/**
 * OWNER-OVERRIDE-NOT-MONEY-FIELDS — Owner load_edit_locked bypass must be field-scoped:
 * non-money metadata only; rate/miles/driver/charges/stops stay blocked (WORM).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-owner-override-not-money-fields";
const UPDATE_LOAD = path.join(ROOT, "apps/backend/src/dispatch/update-load.service.ts");

function read(p) {
  return fs.readFileSync(p, "utf8");
}

export function assertOwnerOverrideNotMoneyFields(src) {
  const fails = [];
  if (!/OWNER_LOCK_OVERRIDE_ALLOWED_FIELD_KEYS/.test(src)) {
    fails.push("update-load.service.ts must export OWNER_LOCK_OVERRIDE_ALLOWED_FIELD_KEYS");
  }
  if (!/LOAD_EDIT_LOCK_MONEY_FIELD_KEYS/.test(src)) {
    fails.push("update-load.service.ts must export LOAD_EDIT_LOCK_MONEY_FIELD_KEYS");
  }
  if (!/export function isOwnerNonMoneyLockOverridePatch/.test(src)) {
    fails.push("update-load.service.ts must export isOwnerNonMoneyLockOverridePatch");
  }
  if (!/canOwnerOverrideLoadEditLock\(input\.requestingUserRole\)/.test(src)) {
    fails.push("isOwnerNonMoneyLockOverridePatch must require Owner role via canOwnerOverrideLoadEditLock");
  }
  if (/canOwnerOverrideLoadEditLock\(input\.requestingUserRole\)\s*\)\s*\{[\s\S]*?appendCrudAudit/.test(src)) {
    fails.push("blanket canOwnerOverrideLoadEditLock audit bypass is forbidden — use isOwnerNonMoneyLockOverridePatch");
  }
  if (!/override_fields/.test(src)) {
    fails.push("Owner override audit must record override_fields[]");
  }
  for (const moneyKey of ["miles_practical", "assigned_primary_driver_id", "customer_id"]) {
    if (!new RegExp(`"${moneyKey}"`).test(src)) {
      fails.push(`LOAD_EDIT_LOCK_MONEY_FIELD_KEYS must include ${moneyKey}`);
    }
  }
  return fails;
}

if (process.argv.includes("--selftest")) {
  const good = read(UPDATE_LOAD);
  if (assertOwnerOverrideNotMoneyFields(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — current sources should pass`);
    process.exit(1);
  }
  const bad = good.replace(
    "isOwnerNonMoneyLockOverridePatch(input)",
    "canOwnerOverrideLoadEditLock(input.requestingUserRole)"
  );
  if (!assertOwnerOverrideNotMoneyFields(bad).length) {
    console.error(`${LABEL} SELFTEST FAIL — planted blanket bypass should fail`);
    process.exit(1);
  }
  console.log(`${LABEL} selftest PASS`);
  process.exit(0);
}

const fails = assertOwnerOverrideNotMoneyFields(read(UPDATE_LOAD));
if (fails.length) {
  console.error(`${LABEL} FAIL`);
  for (const f of fails) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
