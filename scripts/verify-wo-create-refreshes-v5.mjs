#!/usr/bin/env node
/**
 * LV-WO-DISPLAY-ID-V5-IS-HARDCODED-PEND0 ratchet (Rule 03 — V5 = vendor invoice / LABOR / PEND0,
 * NEVER VIN):
 *  work-orders.routes.ts create path must call maintenance.refresh_wo_display_id after INSERT
 *  so ES/AC/ET/RT/RS creates (invoice required) return a real V5, not a permanent -PEND0 stamp.
 *
 * --selftest strips the create-path refresh and expects FAIL.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROUTES = path.join(ROOT, "apps/backend/src/maintenance/work-orders.routes.ts");

function createHandlerSlice(src) {
  // Narrow to POST create Work Order handler body (next_wo_display_id … return row)
  const start = src.indexOf("FROM maintenance.next_wo_display_id");
  if (start < 0) return "";
  const end = src.indexOf("return { unavailable: false as const, row: wo }", start);
  if (end < 0) return src.slice(start, start + 4000);
  return src.slice(start, end);
}

function check(src) {
  const errors = [];
  const slice = createHandlerSlice(src);
  if (!slice) {
    errors.push("create handler slice (next_wo_display_id → return row) not found");
    return errors;
  }
  if (!/refresh_wo_display_id\s*\(\s*\$1\s*\)/.test(slice)) {
    errors.push("create path must call maintenance.refresh_wo_display_id($1) after INSERT");
  }
  // Must not assign V5 from units.vin / RIGHT(vin
  if (/v5[^\n]{0,80}\bvin\b|\bvin\b[^\n]{0,80}v5|RIGHT\s*\(\s*\w*\.?vin/i.test(slice)) {
    errors.push("must not derive V5 from unit VIN (Rule 03: vendor invoice / LABOR / PEND0 only)");
  }
  return errors;
}

function main() {
  const src = fs.readFileSync(ROUTES, "utf8");
  const errors = check(src);
  if (errors.length) {
    console.error("FAIL: verify-wo-create-refreshes-v5");
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log("PASS: verify-wo-create-refreshes-v5 (create path refreshes V5 after INSERT)");
}

function selftest() {
  const original = fs.readFileSync(ROUTES, "utf8");
  const broken = original.replace(
    /await client\.query\(`SELECT maintenance\.refresh_wo_display_id\(\$1\)`, \[wo\.id\]\);/,
    "/* SELFTEST_REMOVED_REFRESH */",
  );
  if (broken === original) {
    console.error("selftest FAIL: could not strip create-path refresh");
    process.exit(1);
  }
  fs.writeFileSync(ROUTES, broken);
  try {
    const errors = check(broken);
    if (!errors.length) {
      console.error("selftest FAIL: expected errors after stripping refresh");
      process.exit(1);
    }
    console.log("selftest PASS: stripped refresh → FAIL as expected");
  } finally {
    fs.writeFileSync(ROUTES, original);
  }
}

if (process.argv.includes("--selftest")) selftest();
else main();
