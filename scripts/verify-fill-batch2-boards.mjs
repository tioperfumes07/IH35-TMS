#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-fill-batch2-boards";
const SURFACES = [
  ["CollectionsPage", "apps/frontend/src/pages/accounting/CollectionsPage.tsx", ["collections-filters-board", "collections-queue-board", "collections-task-detail-board"], ["Run sync now", "EntityLink"]],
  ["VendorBalancesPage", "apps/frontend/src/pages/accounting/VendorBalancesPage.tsx", ["vendor-balances-vendors-board", "vendor-balances-bills-board", "vendor-balances-payments-board"], ["PayBillModal", "vendor-balances-select-"]],
  ["CompanyWaterfallSection", "apps/frontend/src/pages/driver-finance/components/CompanyWaterfallSection.tsx", ["settlement-company-waterfall-section"], ["waterfall-invoiced", "waterfall-net"]],
  ["ImportFuelTransactionsModal", "apps/frontend/src/pages/fuel/components/ImportFuelTransactionsModal.tsx", ["fuel-import-selected-board", "fuel-import-wex-plan-board"], ["SelectCombobox", "fuel-import-kind"]],
];
// --selftest (ACCT-F11105, verify-guard-selftests-are-real): the same check on the real tree must PASS, and on
// planted sources (BoardSection import removed; surfaces emptied) must FAIL.
function check(read) {
  const fails = [];
  for (const [id, rel, ids, keep] of SURFACES) {
    const src = read(rel);
    if (!src.includes("components/v3/BoardSection")) fails.push(`${id}: import BoardSection`);
    for (const tid of ids) {
      if (!new RegExp(`testId=["']${tid}["']`).test(src) && !src.includes(`data-testid="${tid}"`)) {
        fails.push(`${id}: missing testId=${tid}`);
      }
    }
    for (const k of keep) if (!src.includes(k)) fails.push(`${id}: keep ${k}`);
  }
  return fails;
}
const realRead = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

if (process.argv.includes("--selftest")) {
  const cases = [
    ["the real tree passes", realRead, false],
    ["planted: BoardSection import removed fails", (rel) => realRead(rel).replaceAll("components/v3/BoardSection", "components/v3/Removed"), true],
    ["planted: surfaces emptied fails", () => "", true],
  ];
  let bad = 0;
  for (const [name, read, wantFail] of cases) {
    const got = check(read).length > 0;
    console.log(`${got === wantFail ? "ok  " : "FAIL"} ${name}`);
    if (got !== wantFail) bad++;
  }
  console.log(`${LABEL} selftest: ${cases.length - bad}/${cases.length}`);
  process.exit(bad ? 1 : 0);
}

const fails = check(realRead);
if (fails.length) {
  console.error(`${LABEL}: FAIL\n  - ${fails.join("\n  - ")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — ${SURFACES.length} surfaces`);
