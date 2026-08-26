#!/usr/bin/env node
import fs from "node:fs";

const CONTRACTS = [
  ["apps/frontend/src/components/dispatch/DriverBorderCrossingsReverseSection.tsx", "query.isError ? [] : (query.data?.crossings ?? [])"],
  ["apps/frontend/src/components/dispatch/DriverEquipmentTransfersReverseSection.tsx", "query.isError ? [] : (query.data?.requests ?? [])"],
  ["apps/frontend/src/components/dispatch/DriverInTransitIssuesReverseSection.tsx", "query.isError ? [] : (query.data?.issues ?? [])"],
  ["apps/frontend/src/components/dispatch/EquipmentTransfersReverseSection.tsx", "query.isError ? [] : (query.data?.requests ?? [])"],
  ["apps/frontend/src/components/dispatch/UnitBorderCrossingsReverseSection.tsx", "query.isError ? [] : (query.data?.crossings ?? [])"],
  ["apps/frontend/src/components/dispatch/UnitInTransitIssuesReverseSection.tsx", "query.isError ? [] : (query.data?.issues ?? [])"],
  ["apps/frontend/src/components/dispatch/VendorBorderCrossingsReverseSection.tsx", "query.isError ? [] : (query.data?.crossings ?? [])"],
  ["apps/frontend/src/components/dispatch/CustomerLoadTemplatesReverseSection.tsx", "query.isError ? [] : (query.data?.templates ?? [])"],
];

const check = (file, source, contract) => source.includes(contract) ? null : `${file}: failed reverse read must suppress cached rows`;

if (process.argv.includes("--selftest")) {
  for (const [file, contract] of CONTRACTS) {
    const source = fs.readFileSync(file, "utf8");
    const mutated = source.replace(contract, contract.replace(/^query\.isError \? \[\] : \(/, "").replace(/\)$/, ""));
    if (mutated === source || check(file, mutated, contract) == null) {
      console.error(`verify-dispatch-reverse-failure-exclusion SELFTEST FAIL — ${file} mutation stayed green`);
      process.exit(1);
    }
  }
  console.log(`verify-dispatch-reverse-failure-exclusion SELFTEST PASS — ${CONTRACTS.length}/${CONTRACTS.length} exact mutations red`);
  process.exit(0);
}

const failures = CONTRACTS.map(([file, contract]) => check(file, fs.readFileSync(file, "utf8"), contract)).filter(Boolean);
if (failures.length) {
  console.error(`verify-dispatch-reverse-failure-exclusion FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`verify-dispatch-reverse-failure-exclusion PASS — ${CONTRACTS.length} dispatch reverse surfaces fail closed`);
