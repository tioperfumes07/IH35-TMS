#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const postingServicePath = path.join(repoRoot, "apps/backend/src/accounting/posting-engine.service.ts");

function fail(message) {
  console.error("verify:sales-tax-posting-split — FAILED");
  console.error(`- ${message}`);
  process.exit(1);
}

if (!fs.existsSync(postingServicePath)) {
  fail("missing posting-engine service");
}

const source = fs.readFileSync(postingServicePath, "utf8");
if (!/resolveRoleAccountOptional\(client,\s*operatingCompanyId,\s*"sales_tax_payable"\)/.test(source)) {
  fail("invoice posting must resolve sales_tax_payable role");
}
if (!/tax_cents::bigint AS tax_cents/.test(source)) {
  fail("invoice query must include tax_cents");
}
if (!/Sales tax payable/.test(source)) {
  fail("invoice posting must create explicit sales tax payable credit line");
}

console.log("verify:sales-tax-posting-split — OK");
