#!/usr/bin/env node
/** LST-F136 — Dispatch inline pickers / claim create / load banking / revenue drill / bank item human labels. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = [
  "apps/frontend/src/components/dispatch/InlineUnitPicker.tsx",
  "apps/frontend/src/components/dispatch/InlineTrailerPicker.tsx",
  "apps/frontend/src/components/dispatch/InlineDriverPicker.tsx",
  "apps/frontend/src/pages/dispatch/AssignDriverDropdown.tsx",
  "apps/frontend/src/pages/dispatch/LoadBankingLinkagePage.tsx",
  "apps/frontend/src/components/insurance/ClaimCreateModal.tsx",
  "apps/frontend/src/components/home/RevenueDiscrepancyDrill.tsx",
  "apps/frontend/src/components/dispatch/tabs/FinesDeductionsCard.tsx",
  "apps/frontend/src/components/vehicle-profile/CurrentLoadSection.tsx",
  "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx",
];
const LABEL = "verify-dispatch-inline-claim-human-labels";
const SELFTEST = process.argv.includes("--selftest");

function assertAll(srcs) {
  const problems = [];
  for (const [file, src] of Object.entries(srcs)) {
    if (/\.slice\(0,\s*8\)/.test(src)) problems.push(`${file}: still UUID-slices`);
    if (!/entityLabel\(/.test(src)) problems.push(`${file}: missing entityLabel`);
  }
  return problems;
}

const read = () => Object.fromEntries(FILES.map((f) => [f, fs.readFileSync(path.join(ROOT, f), "utf8")]));

if (SELFTEST) {
  const srcs = read();
  const planted = { ...srcs };
  planted[FILES[0]] = planted[FILES[0]].replace(
    /entityLabel\(null,\s*next,\s*"Unit"\)/,
    "next.slice(0, 8)",
  );
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
