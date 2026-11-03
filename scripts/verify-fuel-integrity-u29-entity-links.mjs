#!/usr/bin/env node
/**
 * U29 — Fuel Integrity card/derived tables must EntityLink Unit (and Vendor on derived)
 * when ids are present. Backend must expose unit_id / vendor_id on those rows.
 */
import fs from "node:fs";

const LABEL = "verify-fuel-integrity-u29-entity-links";
const PAGE = "apps/frontend/src/pages/fuel/integrity/FuelIntegrityPage.tsx";
const API = "apps/frontend/src/api/fuel-integrity.ts";
const VERDICTS = "apps/backend/src/fuel/fuel-integrity-verdicts.service.ts";
const DERIVE = "apps/backend/src/fuel/fuel-time-derivation.service.ts";

const page = fs.readFileSync(PAGE, "utf8");
const api = fs.readFileSync(API, "utf8");
const verdicts = fs.readFileSync(VERDICTS, "utf8");
const derive = fs.readFileSync(DERIVE, "utf8");
const fails = [];

if ((page.match(/kind="unit"/g) ?? []).length < 2) {
  fails.push(`${PAGE}: card + derived Unit columns must EntityLink kind=unit`);
}
if (!/kind="vendor"/.test(page) || !/row\.vendor_id/.test(page)) {
  fails.push(`${PAGE}: derived Vendor column must EntityLink via vendor_id`);
}
if (/render:\s*\(row\)\s*=>\s*row\.unit_number\s*\?\?\s*["']—["']/.test(page)) {
  fails.push(`${PAGE}: must not render plain unit_number`);
}
if (!/unit_id: string \| null/.test(api) || !/vendor_id: string \| null/.test(api)) {
  fails.push(`${API}: CardRowVerdict / FuelTimeDerivation must declare unit_id / vendor_id`);
}
if (!/unit_id: \(t\.unit_id as string \| null\)/.test(verdicts) && !/unit_id: \(t\.unit_id/.test(verdicts)) {
  fails.push(`${VERDICTS}: card_rows base must include unit_id from the SELECT`);
}
if (!/ft\.vendor_id::text AS vendor_id/.test(derive) || !/vendor_id: r\.vendor_id/.test(derive)) {
  fails.push(`${DERIVE}: time derivation must SELECT + return vendor_id`);
}

if (process.argv.includes("--selftest")) {
  if (fails.length) {
    console.error(`${LABEL} --selftest FAIL live red:\n  ${fails.join("\n  ")}`);
    process.exit(1);
  }
  const plant = page.replace(/kind="unit"/g, 'kind="load"').replace(/kind="vendor"/g, 'kind="load"');
  if ((plant.match(/kind="unit"/g) ?? []).length >= 2 || /kind="vendor"/.test(plant)) {
    console.error(`${LABEL} --selftest FAIL plant weak`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

if (fails.length) {
  console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — Fuel Integrity Unit/Vendor EntityLinks`);
