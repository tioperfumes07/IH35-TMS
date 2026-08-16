#!/usr/bin/env node
/**
 * CLS-GEOFENCE-LOC-REF — geofence location_ref must use EntityPicker for customer/vendor sites
 * (server-search; no capped listCustomers/listVendors roster) and Combobox for yards.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/operations/GeofencesPage.tsx";
const LABEL = "verify-geofence-location-ref-referenceselect";

export function collectProblems(root = ROOT) {
  const problems = [];
  const src = fs.readFileSync(path.join(root, PAGE), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  if (!/<EntityPicker[\s\S]*?kind=["']customer["'][\s\S]*?allowCreate/.test(code)) {
    problems.push(`${PAGE}: customer_site location ref must use EntityPicker kind=customer allowCreate`);
  }
  if (!/<EntityPicker[\s\S]*?kind=["']vendor["'][\s\S]*?allowCreate/.test(code)) {
    problems.push(`${PAGE}: vendor_site location ref must use EntityPicker kind=vendor allowCreate`);
  }
  if (/listCustomers\(|listVendors\(/.test(code)) {
    problems.push(`${PAGE}: must not capped-listCustomers/listVendors — EntityPicker owns roster`);
  }
  if (/locationKind === "customer_site"[\s\S]{0,400}<select/.test(code)) {
    problems.push(`${PAGE}: customer_site must not use plain <select> for location ref`);
  }
  if (/locationKind === "vendor_site"[\s\S]{0,400}<select/.test(code)) {
    problems.push(`${PAGE}: vendor_site must not use plain <select> for location ref`);
  }
  if (!/locationKind === "yard"[\s\S]{0,400}<Combobox/.test(code)) {
    problems.push(`${PAGE}: yard location ref must use searchable Combobox`);
  }
  if (/locationKind === "yard"[\s\S]{0,400}<select/.test(code)) {
    problems.push(`${PAGE}: yard must not use plain <select> for location ref`);
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const good = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  if (collectProblems().length) {
    console.error(LABEL, "SELFTEST FAIL — live page rejected");
    process.exit(1);
  }
  const mutant = good.replace(/kind=["']vendor["']/, 'kind="unit"');
  const tmpDir = fs.mkdtempSync(path.join(ROOT, "tmp-geofence-loc-"));
  try {
    const rel = "apps/frontend/src/pages/operations";
    fs.mkdirSync(path.join(tmpDir, rel), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, PAGE), mutant);
    if (!collectProblems(tmpDir).length) {
      console.error(LABEL, "SELFTEST FAIL — vendor EntityPicker regression escaped");
      process.exit(1);
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  console.log(LABEL, "SELFTEST OK");
  process.exit(0);
}

const p = collectProblems();
if (p.length) {
  console.error(`${LABEL} FAIL`);
  p.forEach((x) => console.error(" -", x));
  process.exit(1);
}
console.log(`${LABEL} OK`);
