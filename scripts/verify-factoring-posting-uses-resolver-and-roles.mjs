#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const posterPath = path.join(repoRoot, "apps/backend/src/accounting/factoring-posting/poster.service.ts");

function fail(messages) {
  console.error("verify:factoring-posting-uses-resolver-and-roles — FAILED");
  for (const message of messages) console.error(`- ${message}`);
  process.exit(1);
}

const failures = [];
if (!fs.existsSync(posterPath)) {
  failures.push("missing apps/backend/src/accounting/factoring-posting/poster.service.ts");
} else {
  const source = fs.readFileSync(posterPath, "utf8");
  if (!/from "..\/expense-category-map\/resolver\.service\.js"/.test(source)) {
    failures.push("factoring poster must import Block-21 resolver service");
  }
  if (!/resolveAccountForCategory\(\s*operatingCompanyId,\s*"factoring_fee",\s*"default"\s*\)/.test(source)) {
    failures.push("factoring poster must consult resolveAccountForCategory(..., 'factoring_fee', 'default')");
  }
  if (!/from "..\/coa-roles\/resolver\.service\.js"/.test(source) || !/resolveRoleAccount\(/.test(source)) {
    failures.push("factoring poster must resolve COA roles for AR/reserve treatment");
  }
  if (!/source_transaction_type:\s*"customer_payment"/.test(source) || !/postSourceTransaction\(/.test(source)) {
    failures.push("factoring poster must hook through posting backbone via customer_payment source");
  }
}

if (failures.length > 0) fail(failures);
console.log("verify:factoring-posting-uses-resolver-and-roles — OK");
