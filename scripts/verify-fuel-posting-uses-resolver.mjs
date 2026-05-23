#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const posterPath = path.join(repoRoot, "apps/backend/src/accounting/fuel-posting/poster.service.ts");

function fail(messages) {
  console.error("verify:fuel-posting-uses-resolver — FAILED");
  for (const message of messages) console.error(`- ${message}`);
  process.exit(1);
}

const failures = [];
if (!fs.existsSync(posterPath)) {
  failures.push("missing apps/backend/src/accounting/fuel-posting/poster.service.ts");
} else {
  const source = fs.readFileSync(posterPath, "utf8");
  if (!/from "..\/expense-category-map\/resolver\.service\.js"/.test(source)) {
    failures.push("poster.service must import Block-21 resolver.service");
  }
  if (!/resolveAccountForCategory\(\s*input\.operating_company_id,\s*"fuel",\s*fuelKind\s*\)/.test(source)) {
    failures.push("fuel posting must resolve expense account via resolveAccountForCategory(..., 'fuel', kind)");
  }
  if (/INSERT INTO accounting\.expense_category_account_map/i.test(source)) {
    failures.push("poster.service must not write directly to expense_category_account_map");
  }
  if (!/source_transaction_type,\s*source_transaction_id/.test(source) || !/'fuel_event'/.test(source)) {
    failures.push("fuel posting must stamp source_transaction_type='fuel_event' for posting traceability");
  }
}

if (failures.length > 0) fail(failures);
console.log("verify:fuel-posting-uses-resolver — OK");
