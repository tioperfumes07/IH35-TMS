#!/usr/bin/env node
/** LST-F142 / CU-09 — AccountDrawer + InlineUnit + BookLoad + WO modal use userFacingApiError. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-cu09-account-drawer-wire";
const SELFTEST = process.argv.includes("--selftest");

const FILES = [
  "apps/frontend/src/pages/lists/accounting/AccountDrawer.tsx",
  "apps/frontend/src/components/dispatch/InlineUnitPicker.tsx",
  "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx",
  "apps/frontend/src/pages/maintenance/components/CreateWorkOrderModal.tsx",
];

function assertAll(srcs) {
  const problems = [];
  for (const [file, src] of Object.entries(srcs)) {
    if (!/userFacingApiError\(/.test(src)) {
      problems.push(`${file}: missing userFacingApiError`);
    }
    if (/Failed to save account:\s*\$\{/.test(src) || /Failed to archive account:\s*\$\{/.test(src)) {
      problems.push(`${file}: still interpolates raw errCode into submitError`);
    }
    if (/data\.message\s*\?\?\s*data\.error/.test(src) && file.includes("InlineUnitPicker")) {
      problems.push(`${file}: still prefers data.message ?? data.error`);
    }
    if (/Failed to create work order:\s*\$\{String/.test(src) || /Failed to update work order:\s*\$\{String/.test(src)) {
      problems.push(`${file}: still stringifies raw Error.message into toast`);
    }
  }
  return problems;
}

const read = () => Object.fromEntries(FILES.map((f) => [f, fs.readFileSync(path.join(ROOT, f), "utf8")]));

if (SELFTEST) {
  const srcs = read();
  const planted = { ...srcs };
  planted[FILES[0]] = planted[FILES[0]].replaceAll("userFacingApiError(", "String(err ?? ");
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
