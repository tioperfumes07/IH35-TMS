#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const servicePath = path.join(root, "apps/backend/src/accounting/bills.service.ts");
const apiPath = path.join(root, "apps/frontend/src/api/accounting.ts");
const pagePath = path.join(root, "apps/frontend/src/pages/accounting/BillsPage.tsx");

function verify(service, api, page) {
  const failures = [];
  if (!service.includes("ba.account_name AS from_bank_account_name")) failures.push("backend does not project the canonical bank-account label");
  if (!service.includes("LEFT JOIN banking.bank_accounts ba")) failures.push("backend does not join the canonical bank-account table");
  if (!service.includes("ba.operating_company_id = bp.operating_company_id")) failures.push("bank-account label join is not company-scoped");
  if (!api.includes("from_bank_account_name?: string | null")) failures.push("frontend API omits the resolved label contract");
  if (!page.includes("entityLabel(p.from_bank_account_name, p.from_bank_account_id, \"Bank account\")")) failures.push("bill payments still discard the resolved bank-account label");
  return failures;
}

const service = fs.readFileSync(servicePath, "utf8");
const api = fs.readFileSync(apiPath, "utf8");
const page = fs.readFileSync(pagePath, "utf8");

if (process.argv.includes("--selftest")) {
  const mutations = [
    [service.replace("ba.account_name AS from_bank_account_name", "NULL::text AS from_bank_account_name"), api, page],
    [service.replace("ba.operating_company_id = bp.operating_company_id", "TRUE"), api, page],
    [service, api, page.replace("entityLabel(p.from_bank_account_name, p.from_bank_account_id, \"Bank account\")", "entityLabel(null, p.from_bank_account_id, \"Bank account\")")],
  ];
  mutations.forEach((args, index) => {
    if (verify(...args).length === 0) throw new Error(`selftest mutation ${index + 1} escaped`);
  });
  console.log("verify-bill-payment-bank-account-human-label SELFTEST PASS (3/3)");
  process.exit(0);
}

const failures = verify(service, api, page);
if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL: ${failure}`));
  process.exit(1);
}
console.log("verify-bill-payment-bank-account-human-label PASS — producer, contract, consumer, and company scope are wired");
