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
  ["ImportFuelTransactionsModal", "apps/frontend/src/pages/fuel/components/ImportFuelTransactionsModal.tsx", ["fuel-import-selected-board", "fuel-import-wex-plan-board"], ["FORM_SELECT_CLASS", "fuel-import-kind"]],
];
const fails = [];
for (const [id, rel, ids, keep] of SURFACES) {
  const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
  if (!src.includes("components/v3/BoardSection")) fails.push(`${id}: import BoardSection`);
  for (const tid of ids) {
    if (!new RegExp(`testId=["']${tid}["']`).test(src) && !src.includes(`data-testid="${tid}"`)) {
      fails.push(`${id}: missing testId=${tid}`);
    }
  }
  for (const k of keep) if (!src.includes(k)) fails.push(`${id}: keep ${k}`);
}
if (fails.length) { console.error(`${LABEL}: FAIL\n  - ${fails.join("\n  - ")}`); process.exit(1); }
console.log(`${LABEL}: PASS — ${SURFACES.length} surfaces`);
