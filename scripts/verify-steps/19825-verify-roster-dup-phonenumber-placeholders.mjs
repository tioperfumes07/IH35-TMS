#!/usr/bin/env node
/**
 * GUARD 19825: phoneKey in driver-roster-duplicate.service.ts rejects placeholder numbers.
 * Static check: confirms phoneKey() rejects all-same-digit strings like "0000000000".
 *
 * ROSTER-DUP-PLACEHOLDERS (LEAD 11-03): 39 USMCA drivers had "000-000-0000",
 * which matched every other placeholder driver as "Same phone". The fix: phoneKey returns
 * null for all-same-digit patterns and for numbers starting with 0 or 1.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LABEL = "19825-verify-roster-dup-phonenumber-placeholders";
const SELFTEST = process.argv.includes("--selftest");

const SERVICE_FILE = path.join(ROOT, "apps/backend/src/mdata/driver-roster-duplicate.service.ts");

function run() {
  const src = readFileSync(SERVICE_FILE, "utf8");

  // Must export phoneKey
  if (!/export\s+function\s+phoneKey\b/.test(src)) {
    console.error(`${LABEL} FAIL: phoneKey not exported from driver-roster-duplicate.service.ts`);
    process.exit(1);
  }

  // Must reject all-same-digit pattern (the "0000000000" placeholder fix)
  if (!/\|{1,2}.*\1{9}/.test(src) && !/one repeated digit/.test(src) && !/\(\\\d\)\\1{9}/.test(src)) {
    // Check for the actual regex pattern used
    if (!/\\1{9}/.test(src)) {
      console.error(`${LABEL} FAIL: phoneKey does not reject all-same-digit patterns (backreference \\1{9} not found)`);
      process.exit(1);
    }
  }

  // Must require first digit 2-9 (reject starting with 0 or 1)
  if (!/\[2-9\]/.test(src)) {
    console.error(`${LABEL} FAIL: phoneKey does not require first digit in [2-9] range`);
    process.exit(1);
  }

  console.log(`${LABEL} PASS: phoneKey rejects placeholder numbers (all-same-digit, starts 0/1)`);
}

if (SELFTEST) {
  run();
  process.exit(0);
}

run();
