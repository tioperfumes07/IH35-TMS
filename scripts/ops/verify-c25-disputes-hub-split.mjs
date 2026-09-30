#!/usr/bin/env node
/**
 * C-25 — DisputesHub three-way split (Driver / Customer / Vendor).
 * Asserts presentation split; vendor panel is honest-empty (no invented table).
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
const hub = fs.readFileSync(
  path.join(root, "apps/frontend/src/pages/accounting/DisputesHubPage.tsx"),
  "utf8",
);

if (!process.argv.includes("--selftest")) {
  console.log("usage: node scripts/ops/verify-c25-disputes-hub-split.mjs --selftest");
  process.exit(0);
}

for (const needle of [
  'data-testid="disputes-hub-c25"',
  'testId="disputes-party-segment"',
  'data-testid="vendor-disputes-unavailable"',
  'data-c25-section="driver"',
  'data-c25-section="customer"',
  'data-c25-section="vendor"',
  "DisputeParty",
  "listInvoiceDisputeQueue",
  "listDisputeQueue",
  "VendorDisputesSection",
  "Vendor disputes — not in TMS yet",
  "CC-1 A-25",
  "does not reuse",
]) {
  if (!hub.includes(needle)) fail(`C-25 hub missing ${JSON.stringify(needle)}`);
}
ok("C-25 three-party markers present");

// Must not render invoice + settlement sections stacked in one view again.
if (hub.includes("Unified dispute window — invoice + settlement")) {
  fail("C-25 still uses the old unified subtitle");
}
ok("C-25 dropped unified mixed subtitle");

// Vendor path must not call invoice or settlement list APIs.
const vendorBlock = hub.slice(hub.indexOf("function VendorDisputesSection"), hub.indexOf("export function DisputesHubPage"));
if (/listInvoiceDisputeQueue|listDisputeQueue/.test(vendorBlock)) {
  fail("C-25 vendor panel must not query invoice or settlement disputes");
}
ok("C-25 vendor panel does not share customer/driver queries");

console.log("verify-c25-disputes-hub-split --selftest OK");
