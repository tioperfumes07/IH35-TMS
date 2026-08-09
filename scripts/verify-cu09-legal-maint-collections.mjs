#!/usr/bin/env node
/** LST-F147 / CU-09 — legal contracts + maintenance bill/WO + collections use userFacingApiError. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-cu09-legal-maint-collections";
const SELFTEST = process.argv.includes("--selftest");

const FILES = [
  "apps/frontend/src/pages/maintenance/components/CreateBillModal.tsx",
  "apps/frontend/src/pages/maintenance/components/ConvertIssueToWOModal.tsx",
  "apps/frontend/src/pages/legal/contracts/UnifiedContractCreatorModal.tsx",
  "apps/frontend/src/pages/legal/contracts/TruckLeaseCreatorModal.tsx",
  "apps/frontend/src/pages/legal/contracts/SendContractModal.tsx",
  "apps/frontend/src/pages/legal/contracts/LegalContractInstancesPage.tsx",
  "apps/frontend/src/pages/accounting/CollectionsPage.tsx"
];

function assertAll(srcs) {
  const problems = [];
  for (const [file, src] of Object.entries(srcs)) {
    if (!/userFacingApiError\(/.test(src)) problems.push(`${file}: missing userFacingApiError`);
    if (/String\(\(error as Error\)\.message/.test(src)) problems.push(`${file}: still stringifies Error.message`);
  }
  return problems;
}

const read = () => Object.fromEntries(FILES.map((f) => [f, fs.readFileSync(path.join(ROOT, f), "utf8")]));

if (SELFTEST) {
  const srcs = read();
  const planted = { ...srcs };
  planted[FILES[0]] = planted[FILES[0]].replaceAll("userFacingApiError(", "String((error as Error).message || ");
  if (!assertAll(planted).length) {
    console.error(`${LABEL} SELFTEST FAILED: planted defect not caught`);
    process.exit(1);
  }
  const live = assertAll(srcs);
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${live.join(" | ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assertAll(read());
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
