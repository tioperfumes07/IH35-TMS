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

const customerBranch = source.match(/if\s*\(\s*entityType\s*===\s*["']customer["']\s*\)\s*\{[\s\S]*?\n\s*\}/);
if (!customerBranch) {
  fail("customer branch in searchQboMasterData not found");
}

const branchText = customerBranch[0];
if (!branchText.includes("/api/v1/mdata/customers?")) {
  fail('customer autocomplete is not using "/api/v1/mdata/customers"');
}
if (branchText.includes("/api/v1/mdata/qbo/customers")) {
  fail('customer autocomplete still references "/api/v1/mdata/qbo/customers"');
}
if (!branchText.includes("autocomplete")) {
  fail('customer autocomplete request must include "autocomplete=true"');
}

console.log("verify:customer-autocomplete-canonical — OK");
