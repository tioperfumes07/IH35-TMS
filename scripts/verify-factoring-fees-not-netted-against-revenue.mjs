#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const posterPath = path.join(repoRoot, "apps/backend/src/accounting/factoring-fees-posting/poster.service.ts");

function fail(messages) {
  console.error("verify:factoring-fees-not-netted-against-revenue — FAILED");
  for (const message of messages) console.error(`- ${message}`);
  process.exit(1);
}

const failures = [];
if (!fs.existsSync(posterPath)) {
  failures.push("missing apps/backend/src/accounting/factoring-fees-posting/poster.service.ts");
} else {
  const source = fs.readFileSync(posterPath, "utf8");
  if (!/resolveAccountForCategory\(\s*input\.operating_company_id,\s*"factoring_fee",\s*"default"\s*\)/.test(source)) {
    failures.push("factoring fee poster must resolve expense account via Block-21 mapping");
  }
  if (!/debit_or_credit:\s*"debit"/.test(source) || !/Factoring fee expense/.test(source)) {
    failures.push("factoring fee amount must be posted as positive expense debit (VQ6)");
  }
  if (/revenue_default|invoice_revenue|Transportation Revenue|debit_or_credit:\s*"credit"[\s\S]{0,120}Factoring fee expense/i.test(source)) {
    failures.push("factoring fee poster must not net fee against revenue account");
  }
}

if (failures.length > 0) fail(failures);
console.log("verify:factoring-fees-not-netted-against-revenue — OK");
