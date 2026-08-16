#!/usr/bin/env node
/**
 * LV-NO-TARP-ACCESSORIAL-PAY-TYPE ratchet:
 *  catalogs.driver_pay_types must be seeded with flatbed tarp + common accessorials
 *  (ENLONADA, DESENLONADA, DETENTION, LAYOVER, LUMPER) via an additive migration —
 *  never repurpose EXTRA-STOP / TONU.
 *
 * --selftest strips ENLONADA from the migration body and expects FAIL.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIG =
  "db/migrations/202608152230_seed_driver_pay_types_accessorials.sql";

const REQUIRED_CODES = [
  "ENLONADA",
  "DESENLONADA",
  "DETENTION",
  "LAYOVER",
  "LUMPER",
];

function check(sql) {
  const errors = [];
  if (!/__seed_company_catalog\(\s*'driver_pay_types'/.test(sql)) {
    errors.push("migration must call __seed_company_catalog('driver_pay_types', …)");
  }
  for (const code of REQUIRED_CODES) {
    if (!new RegExp(`'code'\\s*,\\s*'${code}'`).test(sql) && !sql.includes(`'${code}'`)) {
      errors.push(`migration missing driver_pay_types code ${code}`);
    }
    // Prefer exact jsonb 'code', 'CODE' shape
    if (!sql.includes(`'${code}'`)) {
      errors.push(`migration does not mention code ${code}`);
    }
  }
  // Must not try to rename/repurpose EXTRA-STOP
  if (/UPDATE\s+catalogs\.driver_pay_types[\s\S]*EXTRA-STOP/i.test(sql)) {
    errors.push("must not UPDATE/repurpose EXTRA-STOP");
  }
  return errors;
}

function main() {
  const abs = path.join(ROOT, MIG);
  if (!fs.existsSync(abs)) {
    console.error(`FAIL: missing ${MIG}`);
    process.exit(1);
  }
  const sql = fs.readFileSync(abs, "utf8");
  const errors = check(sql);
  if (errors.length) {
    console.error("FAIL: verify-driver-pay-types-tarp-seeded");
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(
    `PASS: verify-driver-pay-types-tarp-seeded (${REQUIRED_CODES.join(", ")} in ${MIG})`,
  );
}

function selftest() {
  const abs = path.join(ROOT, MIG);
  const original = fs.readFileSync(abs, "utf8");
  const broken = original.replace(/'ENLONADA'/g, "'ENLONADA_REMOVED'");
  fs.writeFileSync(abs, broken);
  try {
    const errors = check(broken);
    if (!errors.length) {
      console.error("selftest FAIL: expected errors after stripping ENLONADA");
      process.exit(1);
    }
    console.log("selftest PASS: stripped ENLONADA → FAIL as expected");
  } finally {
    fs.writeFileSync(abs, original);
  }
}

if (process.argv.includes("--selftest")) selftest();
else main();
