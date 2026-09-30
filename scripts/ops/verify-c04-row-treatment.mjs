#!/usr/bin/env node
/**
 * C-04 — house row treatment: visible #D8DEE6 separator + hover #EEF2F7 + stripe #FAFBFC.
 * System fix on ParityTable + Customers/Vendors/Drivers master sidebars.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fail = (m) => {
  console.error(`FAIL: ${m}`);
  process.exit(1);
};
const ok = (m) => console.log(`PASS: ${m}`);
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

if (!process.argv.includes("--selftest")) {
  console.log("usage: node scripts/ops/verify-c04-row-treatment.mjs --selftest");
  process.exit(0);
}

const qbo = read("apps/frontend/src/design/qbo-parity.ts");
for (const n of ['divider: "#D8DEE6"', 'rowHover: "#EEF2F7"', 'rowStripe: "#FAFBFC"', 'rowBorder: "border-b border-[#D8DEE6]"']) {
  if (!qbo.includes(n)) fail(`qbo-parity missing ${n}`);
}
ok("C-04 QBO_SURFACE row tokens present");

const parity = read("apps/frontend/src/components/parity/ParityTable.tsx");
if (!parity.includes("QBO_SURFACE_CLASS.rowHover")) fail("ParityTable missing QBO_SURFACE_CLASS.rowHover");
if (!parity.includes('data-c04-row="true"')) fail("ParityTable missing data-c04-row");
if (!parity.includes("QBO_SURFACE.rowStripe")) fail("ParityTable body stripe must use QBO_SURFACE.rowStripe");
if (!parity.includes("QBO_SURFACE.rowSelected")) fail("ParityTable selection must use QBO_SURFACE.rowSelected");
if (/cursor-pointer hover:bg-gray-50/.test(parity)) {
  fail("ParityTable data rows still use weak hover:bg-gray-50");
}
ok("C-04 ParityTable uses house hover/stripe/selected");

for (const [rel, label] of [
  ["apps/frontend/src/pages/customers/CustomerListSidebar.tsx", "Customers sidebar"],
  ["apps/frontend/src/pages/vendors/VendorListSidebar.tsx", "Vendors sidebar"],
  ["apps/frontend/src/pages/drivers/DriverListSidebar.tsx", "Drivers sidebar"],
]) {
  const src = read(rel);
  if (!src.includes("MASTER_DETAIL.rowBorderClass")) fail(`${label}: missing rowBorderClass`);
  if (!src.includes("MASTER_DETAIL.rowStripeClass")) fail(`${label}: missing rowStripeClass`);
  if (!src.includes("MASTER_DETAIL.rowHoverClass")) fail(`${label}: missing rowHoverClass`);
  if (!src.includes('data-c04-row="true"')) fail(`${label}: missing data-c04-row`);
  ok(`C-04 ${label} wired`);
}

const customers = read("apps/frontend/src/pages/Customers.tsx");
if (customers.includes("border-gray-100")) fail("Customers.tsx still uses near-white border-gray-100");
if (!customers.includes("border-[#D8DEE6]")) fail("Customers.tsx DetailRow must use #D8DEE6 divider");
ok("C-04 Customers DetailRow uses house divider");

console.log("verify-c04-row-treatment --selftest OK");
