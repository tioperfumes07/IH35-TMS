#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const posterPath = path.join(repoRoot, "apps/backend/src/accounting/maintenance-posting/poster.service.ts");

function fail(messages) {
  console.error("verify:maintenance-posting-uses-resolver — FAILED");
  for (const message of messages) console.error(`- ${message}`);
  process.exit(1);
}

const failures = [];
if (!fs.existsSync(posterPath)) {
  failures.push("missing apps/backend/src/accounting/maintenance-posting/poster.service.ts");
} else {
  const source = fs.readFileSync(posterPath, "utf8");
  if (!/from "..\/expense-category-map\/resolver\.service\.js"/.test(source)) {
    failures.push("maintenance poster must import Block-21 resolver service");
  }
  if (!/resolveAccountForCategory\(\s*input\.operating_company_id,\s*"maintenance",\s*categoryCode\s*\)/.test(source)) {
    failures.push("maintenance poster must resolve maintenance account via resolveAccountForCategory(..., 'maintenance', categoryCode)");
  }
  if (!/postSourceTransaction\(/.test(source) || !/source_transaction_type:\s*"bill"/.test(source)) {
    failures.push("maintenance poster must post bill via posting backbone hook");
  }
}

if (failures.length > 0) fail(failures);
console.log("verify:maintenance-posting-uses-resolver — OK");
