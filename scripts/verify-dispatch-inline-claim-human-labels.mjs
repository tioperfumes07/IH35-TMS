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
  const assign = srcs["apps/frontend/src/pages/dispatch/AssignDriverDropdown.tsx"];
  if (!assign.includes('userFacingApiError(activeQuery.error, "Could not load available drivers")')) {
    problems.push("AssignDriverDropdown: active load/roster query failure must use operator-safe copy");
  }
  if (!assign.includes("onRetry={() => void activeQuery.refetch()}")) {
    problems.push("AssignDriverDropdown: active load/roster query failure must be retryable");
  }
  if (!assign.includes("activeQuery.isLoading")) {
    problems.push("AssignDriverDropdown: pre-create roster loading state must drive the picker");
  }
  return problems;
}

const read = () => Object.fromEntries(FILES.map((f) => [f, fs.readFileSync(path.join(ROOT, f), "utf8")]));

if (SELFTEST) {
  const srcs = read();
  const mutations = [
    [FILES[0], /entityLabel\(null,\s*next,\s*"Unit"\)/, "next.slice(0, 8)", "UUID slice"],
    ["apps/frontend/src/pages/dispatch/AssignDriverDropdown.tsx", "onRetry={() => void activeQuery.refetch()}", "", "driver retry"],
    ["apps/frontend/src/pages/dispatch/AssignDriverDropdown.tsx", 'userFacingApiError(activeQuery.error, "Could not load available drivers")', 'String(activeQuery.error)', "safe driver error"],
  ];
  for (const [file, needle, replacement, label] of mutations) {
    const planted = { ...srcs, [file]: srcs[file].replace(needle, replacement) };
    if (planted[file] === srcs[file] || !assertAll(planted).length) {
      console.error(`${LABEL} SELFTEST FAILED: planted ${label} defect not caught`);
      process.exit(1);
    }
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
