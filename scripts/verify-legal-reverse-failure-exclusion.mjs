#!/usr/bin/env node
import fs from "node:fs";

const CONTRACTS = [
  ["apps/frontend/src/components/legal/LegalMattersReverseSection.tsx", "query.isError ? [] : (query.data?.matters ?? [])"],
  ["apps/frontend/src/components/legal/VendorLegalContractsReverseSection.tsx", "query.isError ? [] : (query.data?.contracts ?? [])"],
  ["apps/frontend/src/components/customers/CustomerContractsTab.tsx", "legalContractsQuery.isError ? [] : (legalContractsQuery.data?.contracts ?? [])"],
];

const check = (file, source, contract) => source.includes(contract) ? null : `${file}: failed legal reverse read must suppress cached rows`;

if (process.argv.includes("--selftest")) {
  for (const [file, contract] of CONTRACTS) {
    const source = fs.readFileSync(file, "utf8");
    const mutated = source.replace(contract, contract.replace(/^[A-Za-z]+(?:Query)?\.isError \? \[\] : \(/, "").replace(/\)$/, ""));
    if (mutated === source || check(file, mutated, contract) == null) {
      console.error(`verify-legal-reverse-failure-exclusion SELFTEST FAIL — ${file} mutation stayed green`);
      process.exit(1);
    }
  }
  console.log(`verify-legal-reverse-failure-exclusion SELFTEST PASS — ${CONTRACTS.length}/${CONTRACTS.length} exact mutations red`);
  process.exit(0);
}

const failures = CONTRACTS.map(([file, contract]) => check(file, fs.readFileSync(file, "utf8"), contract)).filter(Boolean);
if (failures.length) {
  console.error(`verify-legal-reverse-failure-exclusion FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`verify-legal-reverse-failure-exclusion PASS — ${CONTRACTS.length} legal reverse surfaces fail closed`);
