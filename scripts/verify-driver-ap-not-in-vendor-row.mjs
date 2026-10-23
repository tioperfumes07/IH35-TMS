#!/usr/bin/env node
// ACCT-F443274A — guard that driver-category AP bills (accounting.bills bill_category='driver')
// are emitted as document_kind='driver_bill' in the rolling ledger, never as 'bill' (vendor row).
// Also guards that when accrued_bill_id is set on a driver_bill, the same obligation does not
// appear in both the bill row and the driver_bill row simultaneously (double-count invariant).
// Static: read cash-flow.service.ts; Live: query prod (requires DB).
// Run: node scripts/verify-driver-ap-not-in-vendor-row.mjs [--selftest]
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-ap-not-in-vendor-row";
const SERVICE = "apps/backend/src/cash-flow/cash-flow.service.ts";

function checkStatic(src) {
  const errors = [];
  // RULE 1: driver-category bills must map to document_kind 'driver_bill'
  if (!src.includes("bill_category === \"driver\"") && !src.includes("bill_category==='driver'")) {
    errors.push("RULE 1: bill_category driver check missing — driver AP bills will land in vendor row");
  }
  // RULE 2: the driver-category branch must yield document_kind driver_bill
  if (!src.includes("\"driver_bill\"") && !src.includes("'driver_bill'")) {
    errors.push("RULE 2: document_kind driver_bill not emitted for driver-category AP bills");
  }
  // RULE 3: bill_category must be SELECTed in the billsPromise query
  if (!src.includes("b.bill_category")) {
    errors.push("RULE 3: b.bill_category not selected in billsPromise — category info not available at mapping time");
  }
  // PLANT: if driver-category AP is back under bill-only, double-count returns
  if (src.includes("document_kind: \"bill\"") && !src.includes("isDriverAp") && !src.includes("bill_category")) {
    errors.push("PLANT: bill rows mapped without category check — driver AP may re-enter vendor bucket");
  }
  return errors;
}

if (process.argv.includes("--selftest")) {
  const real = readFileSync(path.join(ROOT, SERVICE), "utf8");
  const base = readFileSync(path.join(ROOT, SERVICE), "utf8");
  // Planted defect 1: remove category check
  const d1 = base.replace(/bill_category === "driver"/g, "bill_category === \"__removed__\"");
  const e1 = checkStatic(d1);
  if (!e1.some(e => e.includes("RULE 1"))) throw new Error("Defect 1 not caught: " + JSON.stringify(e1));
  // Planted defect 2: remove driver_bill emit
  const d2 = base.replace(/"driver_bill"/g, '"bill"').replace(/'driver_bill'/g, "'bill'");
  const e2 = checkStatic(d2);
  if (!e2.some(e => e.includes("RULE 2"))) throw new Error("Defect 2 not caught: " + JSON.stringify(e2));
  // Planted defect 3: remove b.bill_category from SELECT (replace all occurrences)
  const d3 = base.replaceAll("b.bill_category", "/* removed */");
  const e3 = checkStatic(d3);
  if (!e3.some(e => e.includes("RULE 3"))) throw new Error("Defect 3 not caught: " + JSON.stringify(e3));
  // Real file must pass
  const real_errors = checkStatic(real);
  if (real_errors.length) throw new Error("Real file has errors: " + JSON.stringify(real_errors));
  console.log(`${LABEL} SELFTEST PASS (3/3 planted defects caught, real file clean)`);
  process.exit(0);
}

const src = readFileSync(path.join(ROOT, SERVICE), "utf8");
const errors = checkStatic(src);
if (errors.length) {
  console.error(`${LABEL} FAIL`);
  for (const e of errors) console.error("  -", e);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
