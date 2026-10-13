#!/usr/bin/env node
/**
 * GUARD — ROUND 443.30: one fuel ticket can carry several products (Loves 2870483: diesel + DEF). The live duplicate index is
 * per (vendor, reference, fuel_type), so the hand-entered source_row_hash must be too, or the second product collides on
 * fuel_tx_source_row_hash_uk (measured: 5769 preview refused). Diesel keeps its original hash so existing rows never change.
 * Asserts: enteredFuelRowHash takes the fuel type, appends it for non-diesel only, and both writers pass it.
 * Run: node scripts/verify-settlement-creator-fuel-row-hash-per-product.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-creator-fuel-row-hash-per-product";
const F = {
  ref: "apps/backend/src/fuel/fuel-provider-reference.ts",
  creator: "apps/backend/src/driver-finance/settlement-creator.service.ts",
  form: "apps/backend/src/fuel/fuel-transactions.routes.ts",
};

export function problems(src) {
  const p = [];
  if (!/fuelType\?: string \| null/.test(src.ref)) p.push("enteredFuelRowHash does not take the fuel type");
  if (!/fuelType && fuelType !== "diesel" \? `:\$\{fuelType\}` : ""/.test(src.ref)) p.push("the hash does not append the product for non-diesel (or changes diesel)");
  if (!/\$\{providerId\}\$\{product\}/.test(src.ref)) p.push("the product suffix is not part of the provider hash");
  if (!/enteredFuelRowHash\(draft\.operating_company_id, vendor\.id, fuel\.invoice, fuel\.fuel_type \?\? "diesel"\)/.test(src.creator)) p.push("the Settlement Creator does not pass the fuel type");
  if (!/enteredFuelRowHash\(b\.operating_company_id, b\.vendor_id \?\? null, b\.transaction_reference, b\.fuel_type\)/.test(src.form)) p.push("the fuel form does not pass the fuel type");
  return p;
}

const read = () => Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, fs.readFileSync(path.join(ROOT, rel), "utf8")]));

function selftest() {
  const good = read();
  const bad = [];
  if (problems(good).length) bad.push(`real tree flagged: ${problems(good).join("; ")}`);
  const plants = [
    ["ref", (s) => s.replace('fuelType && fuelType !== "diesel" ? `:${fuelType}` : ""', 'fuelType ? `:${fuelType}` : ""')],
    ["ref", (s) => s.replace("${providerId}${product}", "${providerId}")],
    ["creator", (s) => s.replace(', fuel.fuel_type ?? "diesel")', ")")],
    ["form", (s) => s.replace(", b.transaction_reference, b.fuel_type)", ", b.transaction_reference)")],
  ];
  for (const [k, f] of plants) {
    const planted = f(good[k]);
    if (planted === good[k]) bad.push(`plant on ${k} did not apply`);
    else if (!problems({ ...good, [k]: planted }).length) bad.push(`plant on ${k} passed`);
  }
  if (bad.length) { console.error(`${LABEL} selftest FAIL\n- ${bad.join("\n- ")}`); process.exit(1); }
  console.log(`${LABEL} selftest PASS (${plants.length} plants caught)`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const p = problems(read());
  if (p.length) { console.error(`${LABEL} FAIL\n- ${p.join("\n- ")}`); process.exit(1); }
  console.log(`${LABEL} PASS`);
}
