#!/usr/bin/env node
/** LST-F134 — Settlement close / pay-run / layover / advances / geofences / bank links human labels. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = [
  "apps/frontend/src/pages/driver-finance/SettlementCloseArrivalPage.tsx",
  "apps/frontend/src/pages/driver-finance/components/PayRunClosePanel.tsx",
  "apps/frontend/src/pages/drivers/DriverLayoverHistory.tsx",
  "apps/frontend/src/pages/cash-advances/components/AdvanceDetailDrawer.tsx",
  "apps/frontend/src/pages/cash-advances/components/CashAdvancesTable.tsx",
  "apps/frontend/src/pages/operations/GeofencesPage.tsx",
  "apps/frontend/src/components/banking/LinkedBankTransactionsPanel.tsx",
  "apps/frontend/src/components/allocation/BillAllocationPanel.tsx",
];
const LABEL = "verify-settlement-advances-geofence-human-labels";
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
  planted[FILES[2]] = planted[FILES[2]].replace(
    /entityLabel\(null,\s*row\.previous_load_uuid,\s*"Load"\)/,
    "row.previous_load_uuid?.slice(0, 8)",
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
