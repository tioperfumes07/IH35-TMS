#!/usr/bin/env node
/** ROUND 319 ORDERS — Vendor profile engines: A/P, WOs, fuel, documents, W-9/1099, insurance. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LABEL = "verify-r319-vendor-engines";
const file = "apps/frontend/src/pages/VendorDetail.tsx";
const text = fs.readFileSync(path.join(ROOT, file), "utf8");
const needles = [
  '"Profile"',
  '"A/P"',
  '"Documents"',
  '"W-9 / 1099"',
  "DocumentsTab",
  'entityType="vendor"',
  "VendorWorkOrdersReverseSection",
  "FuelTransactionsReverseSection",
  "VendorInsurancePoliciesReverseSection",
  "eligible_1099",
  "listVendorBills",
];
const problems = [];
for (const n of needles) {
  if (!text.includes(n)) problems.push(`${file}: missing ${JSON.stringify(n)}`);
}
if (problems.length) {
  console.error(`${LABEL} FAIL:\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — Vendor Detail: Profile · A/P · Documents · W-9/1099 · WO · fuel · insurance`);
