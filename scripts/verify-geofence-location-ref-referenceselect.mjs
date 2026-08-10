#!/usr/bin/env node
/**
 * CLS-GEOFENCE-LOC-REF — geofence location_ref must use ReferenceSelect for customer/vendor sites.
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
  if (!/createKind=["']customer["']/.test(src) || !/createKind=["']vendor["']/.test(src)) {
    problems.push(`${PAGE}: customer_site + vendor_site location refs must use ReferenceSelect`);
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
  const bad = '<select value={locationRefId} onChange={e => setLocationRefId(e.target.value)} />';
  const good = '<ReferenceSelect createKind="customer" createKind="vendor" value={locationRefId} />';
  if (!/<select[\s\S]*locationRefId/.test(bad) || !/ReferenceSelect/.test(good)) {
    console.error(LABEL, "SELFTEST FAIL");
    process.exit(1);
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
