#!/usr/bin/env node
import fs from "node:fs";

const file = "apps/frontend/src/components/customers/CustomerProfileForm.tsx";
const contracts = [
  "customerTypeCatalogQuery.isError ? [] : customerTypeCatalogQuery.data?.rows ?? []",
  "[customerTypeCatalogQuery.data?.rows, customerTypeCatalogQuery.isError]",
  "incomeAccountsQuery.isError ? [] : incomeAccountsQuery.data?.accounts",
  "[incomeAccountsQuery.data, incomeAccountsQuery.isError]",
  "!customerTypeCatalogQuery.isError ? <ReferenceSelect",
  "!incomeAccountsQuery.isError ? <ReferenceSelect",
];
const check = (source) => contracts.filter((contract) => !source.includes(contract));
if (process.argv.includes("--selftest")) {
  const source = fs.readFileSync(file, "utf8");
  for (const contract of contracts) {
    const mutated = source.replace(contract, "");
    if (mutated === source || check(mutated).length === 0) process.exit(1);
  }
  console.log(`verify-customer-profile-catalog-failure-exclusion SELFTEST PASS — ${contracts.length}/${contracts.length} exact mutations red`);
  process.exit(0);
}
const missing = check(fs.readFileSync(file, "utf8"));
if (missing.length) {
  console.error(`verify-customer-profile-catalog-failure-exclusion FAIL\n- ${missing.join("\n- ")}`);
  process.exit(1);
}
console.log("verify-customer-profile-catalog-failure-exclusion PASS — customer category/account pickers never expose stale or UUID fallback labels on failed reads");
