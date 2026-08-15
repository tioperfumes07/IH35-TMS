#!/usr/bin/env node
/** LST-F134 — Settlement close / pay-run / layover / advances / geofences / bank links human labels. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BACKEND = "apps/backend/src/dispatch/layovers/detection.service.ts";
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
  for (const file of FILES) {
    const src = srcs[file];
    if (/\.slice\(0,\s*8\)/.test(src)) problems.push(`${file}: still UUID-slices`);
    if (!/(?:entityLabel|formatEntityLabel)\(/.test(src)) problems.push(`${file}: missing entity label formatter`);
  }
  const backend = srcs[BACKEND];
  const layover = srcs[FILES[2]];
  if (!/previous_load\.id\s*=\s*dl\.previous_load_uuid/.test(backend)) problems.push(`${BACKEND}: previous load is not joined by canonical FK`);
  if (!/previous_load\.operating_company_id\s*=\s*dl\.operating_company_id/.test(backend)) problems.push(`${BACKEND}: previous load join is not company-scoped`);
  if (!/next_load\.id\s*=\s*dl\.next_load_uuid/.test(backend)) problems.push(`${BACKEND}: next load is not joined by canonical FK`);
  if (!/next_load\.operating_company_id\s*=\s*dl\.operating_company_id/.test(backend)) problems.push(`${BACKEND}: next load join is not company-scoped`);
  if (!/previous_load\.load_number\s+AS\s+previous_load_number/i.test(backend)) problems.push(`${BACKEND}: previous human load number missing from payload`);
  if (!/next_load\.load_number\s+AS\s+next_load_number/i.test(backend)) problems.push(`${BACKEND}: next human load number missing from payload`);
  if (!/entityLabel\(row\.previous_load_number,\s*row\.previous_load_uuid,\s*"Load"\)/.test(layover)) problems.push(`${FILES[2]}: previous load link does not consume its human label`);
  if (!/entityLabel\(row\.next_load_number,\s*row\.next_load_uuid,\s*"Load"\)/.test(layover)) problems.push(`${FILES[2]}: next load link does not consume its human label`);
  return problems;
}

const read = () => Object.fromEntries([...FILES, BACKEND].map((f) => [f, fs.readFileSync(path.join(ROOT, f), "utf8")]));

if (SELFTEST) {
  const srcs = read();
  const mutations = [
    [BACKEND, "previous_load.operating_company_id = dl.operating_company_id", "TRUE"],
    [BACKEND, "next_load.load_number AS next_load_number", "NULL AS next_load_number"],
    [FILES[2], "entityLabel(row.previous_load_number, row.previous_load_uuid, \"Load\")", "entityLabel(null, row.previous_load_uuid, \"Load\")"],
  ];
  for (const [file, before, after] of mutations) {
    const planted = { ...srcs, [file]: srcs[file].replace(before, after) };
    if (planted[file] === srcs[file] || !assertAll(planted).length) {
      console.error(`${LABEL} SELFTEST FAILED: planted defect not caught in ${file}: ${before}`);
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
