#!/usr/bin/env node
/**
 * Static guard for BLOCK-03: Mexico is NOT an IFTA jurisdiction (IFTA Articles of Agreement
 * cover the 48 contiguous US states + Canadian provinces only). This locks two invariants so
 * they can't silently regress:
 *
 *   1. The held migration seeds reference.non_ifta_jurisdictions with the Mexican jurisdiction
 *      codes this carrier's lanes touch (MX/TAM/NL).
 *   2. ifta-tax-calculator.ts's calculateStateTaxes() must force tax_owed=0 / taxable_gallons=0
 *      for any row where is_ifta_jurisdiction is false — a non-IFTA jurisdiction's miles are
 *      visibility-only and must NEVER be taxed, no matter what rate a caller passes.
 *
 * Pure file-content checks — no DB required.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const MIGRATION = "db/migrations/202607130200_block03_ifta_trip_methodology_extend.sql";
const CALCULATOR = "apps/backend/src/ifta/ifta-tax-calculator.ts";

let failed = 0;
function fail(msg) {
  console.error(`verify-ifta-non-taxable-jurisdiction: ${msg}`);
  failed = 1;
}
function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) {
    fail(`expected file is missing: ${rel}`);
    return "";
  }
  return fs.readFileSync(p, "utf8");
}

const migration = read(MIGRATION);
if (migration) {
  if (!/reference\.non_ifta_jurisdictions/.test(migration)) {
    fail(`${MIGRATION} must create reference.non_ifta_jurisdictions.`);
  }
  for (const code of ["'MX'", "'TAM'", "'NL'"]) {
    if (!migration.includes(code)) {
      fail(`${MIGRATION} must seed jurisdiction_code ${code} into reference.non_ifta_jurisdictions.`);
    }
  }
}

const calculator = read(CALCULATOR);
if (calculator) {
  if (!/isIftaJurisdiction\s*\?\s*.*getTaxRateForState|isIftaJurisdiction\s*\?\s*\(/.test(calculator)) {
    fail(`${CALCULATOR} must gate tax_rate_per_gallon on isIftaJurisdiction (non-IFTA jurisdictions get rate 0).`);
  }
  if (!/isIftaJurisdiction\s*&&\s*fleetMpg/.test(calculator)) {
    fail(`${CALCULATOR} must gate taxable_gallons computation on isIftaJurisdiction (non-IFTA jurisdictions never get taxable gallons).`);
  }
  if (!/const taxOwed = isIftaJurisdiction \? /.test(calculator)) {
    fail(`${CALCULATOR} must gate tax_owed on isIftaJurisdiction — a non-IFTA jurisdiction (Mexico) must never accrue tax.`);
  }
}

if (failed) {
  console.error("verify-ifta-non-taxable-jurisdiction: FAILED");
  process.exit(1);
}
console.log("verify-ifta-non-taxable-jurisdiction: OK — Mexico jurisdiction rows are seeded non-IFTA and the calculator never taxes them.");
