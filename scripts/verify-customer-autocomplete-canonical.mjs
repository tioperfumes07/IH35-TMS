#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const targetFile = path.join(ROOT, "apps", "frontend", "src", "api", "qbo-mdata.ts");

function fail(message) {
  console.error(`verify:customer-autocomplete-canonical — FAILED: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(targetFile)) {
  fail("apps/frontend/src/api/qbo-mdata.ts not found");
}

const source = fs.readFileSync(targetFile, "utf8");

// The customer + vendor pickers must read the CANONICAL master tables (mdata.customers / mdata.vendors)
// via autocomplete mode, never the mdata.qbo_* mirror — otherwise records created through the canonical
// writer are invisible in the picker ("create → disappears"). These are combined into one branch.
const canonicalBranch = source.match(
  /if\s*\(\s*entityType\s*===\s*["']customer["']\s*\|\|\s*entityType\s*===\s*["']vendor["']\s*\)\s*\{[\s\S]*?\n\s*\}/
);
if (!canonicalBranch) {
  fail("combined customer||vendor canonical branch in searchQboMasterData not found");
}

// LEAD 443.188: 443.182-A (#26871) moved each catalog's requests into its ONE api module (catalog-customers.ts /
// catalog-vendors.ts); the branch now delegates to them. Same rule, read where the request now lives.
let branchText = canonicalBranch[0];
for (const [fn, mod] of [["searchCustomersQboAutocomplete", "catalog-customers.ts"], ["searchVendorsQboAutocomplete", "catalog-vendors.ts"]]) {
  if (branchText.includes(fn)) {
    const modSrc = fs.readFileSync(path.join(ROOT, "apps", "frontend", "src", "api", mod), "utf8");
    const body = modSrc.match(new RegExp(`export function ${fn}\\([\\s\\S]*?\\n\\}`));
    if (!body) fail(`${fn} not found in ${mod}`);
    branchText += "\n" + body[0];
  }
}
for (const path of ["/api/v1/mdata/customers", "/api/v1/mdata/vendors"]) {
  if (!branchText.includes(path)) fail(`canonical autocomplete is not using "${path}"`);
}
for (const mirror of ["/api/v1/mdata/qbo/customers", "/api/v1/mdata/qbo/vendors"]) {
  if (branchText.includes(mirror)) fail(`canonical autocomplete still references the mirror "${mirror}"`);
}
if (!branchText.includes("autocomplete")) {
  fail('canonical autocomplete request must include "autocomplete=true"');
}

console.log("verify:customer-autocomplete-canonical — OK (customer + vendor canonical)");
