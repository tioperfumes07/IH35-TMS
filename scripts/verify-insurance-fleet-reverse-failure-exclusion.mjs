#!/usr/bin/env node
import fs from "node:fs";

const CONTRACTS = [
  ["apps/frontend/src/components/insurance/InsuranceClaimsReverseSection.tsx", "query.isError ? [] : (query.data?.claims ?? [])"],
  ["apps/frontend/src/components/insurance/InsuranceLawsuitsReverseSection.tsx", "query.isError ? [] : (query.data?.lawsuits ?? [])"],
  ["apps/frontend/src/components/insurance/VendorInsurancePoliciesReverseSection.tsx", "query.isError ? [] : (query.data?.policies ?? [])"],
  ["apps/frontend/src/components/fleet/UnitDefaultDriversReverseSection.tsx", "query.isError ? [] : (query.data?.drivers ?? [])"],
];

const check = (file, source, contract) => source.includes(contract) ? null : `${file}: failed reverse read must suppress cached rows`;

if (process.argv.includes("--selftest")) {
  for (const [file, contract] of CONTRACTS) {
    const source = fs.readFileSync(file, "utf8");
    const mutated = source.replace(contract, contract.replace(/^query\.isError \? \[\] : \(/, "").replace(/\)$/, ""));
    if (mutated === source || check(file, mutated, contract) == null) {
      console.error(`verify-insurance-fleet-reverse-failure-exclusion SELFTEST FAIL — ${file} mutation stayed green`);
      process.exit(1);
    }
  }
  console.log(`verify-insurance-fleet-reverse-failure-exclusion SELFTEST PASS — ${CONTRACTS.length}/${CONTRACTS.length} exact mutations red`);
  process.exit(0);
}

const failures = CONTRACTS.map(([file, contract]) => check(file, fs.readFileSync(file, "utf8"), contract)).filter(Boolean);
if (failures.length) {
  console.error(`verify-insurance-fleet-reverse-failure-exclusion FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`verify-insurance-fleet-reverse-failure-exclusion PASS — ${CONTRACTS.length} insurance/fleet reverse surfaces fail closed`);
