#!/usr/bin/env node
/** LST-F152 / CU-09 — remaining err-as-Error toast/action paths use userFacingApiError. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-cu09-err-remainder";
const SELFTEST = process.argv.includes("--selftest");

const FILES = [
  "apps/frontend/src/pages/banking/components/PlaidReconnectButton.tsx",
  "apps/frontend/src/components/tasks/TaskLinkPicker.tsx",
  "apps/frontend/src/components/dispatch/tabs/FactoringTab.tsx",
  "apps/frontend/src/components/parity/drawers/NewClassDrawerForm.tsx",
  "apps/frontend/src/components/parity/drawers/NewCustomerDrawerForm.tsx",
  "apps/frontend/src/components/parity/drawers/NewAccountDrawerForm.tsx",
  "apps/frontend/src/components/parity/drawers/NewServiceDrawerForm.tsx",
  "apps/frontend/src/components/parity/drawers/NewVendorDrawerForm.tsx",
  "apps/frontend/src/pages/driver-finance/EscrowDeductionsPendingTab.tsx",
  "apps/frontend/src/components/dispatch/tabs/FinesDeductionsCard.tsx",
];

function assertAll(srcs) {
  const problems = [];
  for (const [file, src] of Object.entries(srcs)) {
    if (!/userFacingApiError\(/.test(src)) problems.push(`${file}: missing userFacingApiError`);
    if (/String\(\((?:err|error) as Error\)\.message/.test(src)) {
      problems.push(`${file}: still stringifies Error.message`);
    }
  }
  return problems;
}

const read = () => Object.fromEntries(FILES.map((f) => [f, fs.readFileSync(path.join(ROOT, f), "utf8")]));

if (SELFTEST) {
  const srcs = read();
  const planted = { ...srcs };
  planted[FILES[0]] = planted[FILES[0]].replaceAll("userFacingApiError(", "String((err as Error).message || ");
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
