#!/usr/bin/env node
/**
 * Static guard: load-linked settlement metadata must be non-null.
 * - load_bookended settlements must stamp first_load_id / first_load_number on open
 *   and last_load_id / last_load_number on close.
 * - Earnings settlement lines from a driver bill must stamp source_driver_bill_id
 *   when the column exists.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bookended = fs.readFileSync(path.join(ROOT, "apps/backend/src/driver-finance/settlements-load-bookended.service.ts"), "utf8");
const engine = fs.readFileSync(path.join(ROOT, "apps/backend/src/driver-finance/settlement-engine.ts"), "utf8");
const errors = [];

if (!/first_load_id\s*,\s*\n\s*first_load_number/.test(bookended)) {
  errors.push("openLoadBookendedSettlement INSERT does not include first_load_id + first_load_number");
}
if (!/last_load_id\s*=\s*\$3/.test(bookended) || !/last_load_number\s*=\s*\$4/.test(bookended)) {
  errors.push("close path does not set last_load_id + last_load_number");
}
if (!/source_driver_bill_id/.test(engine)) {
  errors.push("settlement-engine does not stamp source_driver_bill_id");
}
if (!/ON CONFLICT \(source_driver_bill_id\)/.test(engine)) {
  errors.push("settlement-engine does not guard source_driver_bill_id uniqueness");
}

if (errors.length > 0) {
  for (const e of errors) console.error("FAIL:", e);
  process.exit(1);
}
console.log("PASS: settlement load-linkage non-null invariants wired");
process.exit(0);
