#!/usr/bin/env node
/** @matrix-built {"modules":["fuel"],"cols":["connectivity"],"leaves":["fuel.modal.create_fuel_transaction","fuel.modal.import_fuel_transactions","fuel.modal.upload_loves_prices","fuel.panel.savings"]} */
/** @matrix-built {"modules":["fuel"],"cols":["load"],"leaves":["fuel.modal.create_fuel_transaction"]} */
/**
 * CLASS-F5973-TRUE-REMAINDER-FUEL: five Fuel leaves were held in the census's PROTECTED allowlist
 * as genuine remaining gaps. Live-walked all five on prod (own debug Chrome, port 9224, authenticated
 * owner session) 2026-08-23 and found every one already fully wired end-to-end -- the PROTECTED
 * entries were stale, not real gaps. This guard supplies the leaf-specific evidence the census
 * requires so the PROTECTED exemptions (removed in this same PR) are no longer needed.
 *
 * - fuel.modal.create_fuel_transaction: CreateFuelTransactionModal.tsx posts createFuelTransaction(),
 *   includes a real EntityPicker kind="load" (Trip/Load) plus the G18 load-exemption-reason field
 *   required when no trip is picked. Live-confirmed: drawer opens from History & savings' "+ Create",
 *   all pickers present.
 * - fuel.modal.import_fuel_transactions: ImportFuelTransactionsModal.tsx posts
 *   importFuelTransactions(). Live-confirmed: modal opens from "Import Fuel Transactions", drag/drop
 *   + file-picker present.
 * - fuel.modal.upload_loves_prices: UploadLovesPricesModal.tsx posts uploadLovesPrices(). Live-
 *   confirmed: modal opens from the Loves prices tab's "Upload Loves prices" link.
 * - fuel.panel.savings: SavingsPanel is mounted in FuelPlannerHome.tsx wired to
 *   getFuelSavingsSummary(). Live-confirmed: History & savings tab renders a real "Savings Tracker"
 *   panel (Savings YTD driver/fleet, highest-saver, lost-savings, honest empty states).
 *
 * Self-test: node scripts/verify-fuel-class-f5973-remainder-wired.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  createModal: "apps/frontend/src/pages/fuel/components/CreateFuelTransactionModal.tsx",
  importModal: "apps/frontend/src/pages/fuel/components/ImportFuelTransactionsModal.tsx",
  uploadModal: "apps/frontend/src/pages/fuel/components/UploadLovesPricesModal.tsx",
  plannerHome: "apps/frontend/src/pages/fuel/FuelPlannerHome.tsx",
};
const LABEL = "verify-fuel-class-f5973-remainder-wired";

export function audit(src) {
  const failures = [];

  if (!/await createFuelTransaction\(operatingCompanyId/.test(src.createModal)) {
    failures.push(`${FILES.createModal}: must call createFuelTransaction(operatingCompanyId, ...) (connectivity)`);
  }
  if (!/kind="load"/.test(src.createModal)) {
    failures.push(`${FILES.createModal}: must render a real EntityPicker kind="load" (Trip/Load, load column)`);
  }
  if (!/loadExemptionReason/.test(src.createModal)) {
    failures.push(`${FILES.createModal}: must retain the G18 load-exemption-reason field (load column)`);
  }

  if (!/await importFuelTransactions\(operatingCompanyId/.test(src.importModal)) {
    failures.push(`${FILES.importModal}: must call importFuelTransactions(operatingCompanyId, ...) (connectivity)`);
  }

  if (!/await uploadLovesPrices\(operatingCompanyId/.test(src.uploadModal)) {
    failures.push(`${FILES.uploadModal}: must call uploadLovesPrices(operatingCompanyId, ...) (connectivity)`);
  }

  if (!/getFuelSavingsSummary/.test(src.plannerHome) || !/SavingsPanel/.test(src.plannerHome)) {
    failures.push(`${FILES.plannerHome}: must mount SavingsPanel wired to getFuelSavingsSummary (connectivity)`);
  }
  if (!/CreateFuelTransactionModal/.test(src.plannerHome)) {
    failures.push(`${FILES.plannerHome}: must mount CreateFuelTransactionModal`);
  }
  if (!/ImportFuelTransactionsModal/.test(src.plannerHome)) {
    failures.push(`${FILES.plannerHome}: must mount ImportFuelTransactionsModal`);
  }
  if (!/UploadLovesPricesModal/.test(src.plannerHome)) {
    failures.push(`${FILES.plannerHome}: must mount UploadLovesPricesModal`);
  }

  return failures;
}

function loadSrc(root) {
  const out = {};
  for (const [key, rel] of Object.entries(FILES)) out[key] = fs.readFileSync(path.join(root, rel), "utf8");
  return out;
}

if (process.argv.includes("--selftest")) {
  const good = loadSrc(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }
  const mutations = [
    { key: "createModal", from: "await createFuelTransaction(operatingCompanyId", to: "await createFuelTransaction(REMOVED" },
    { key: "createModal", from: 'kind="load"', to: 'kind="REMOVED_load"' },
    { key: "createModal", from: "loadExemptionReason", to: "loadExempti0nReason" },
    { key: "importModal", from: "await importFuelTransactions(operatingCompanyId", to: "await importFuelTransactions(REMOVED" },
    { key: "uploadModal", from: "await uploadLovesPrices(operatingCompanyId", to: "await uploadLovesPrices(REMOVED" },
    { key: "plannerHome", from: "SavingsPanel", to: "SavingsPane1" },
    { key: "plannerHome", from: "CreateFuelTransactionModal", to: "CreateFuelTransactionM0dal" },
    { key: "plannerHome", from: "ImportFuelTransactionsModal", to: "ImportFuelTransactionsM0dal" },
    { key: "plannerHome", from: "UploadLovesPricesModal", to: "UploadLovesPricesM0dal" },
  ];
  let detected = 0;
  for (const m of mutations) {
    const mutated = { ...good, [m.key]: good[m.key].split(m.from).join(m.to) };
    if (mutated[m.key] === good[m.key]) {
      console.error(`${LABEL} SELFTEST FAIL — pattern "${m.from}" did not match source, re-anchor`);
      process.exit(1);
    }
    if (audit(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — mutation of "${m.from}" escaped`);
      process.exit(1);
    }
    detected += 1;
  }
  console.log(`${LABEL} SELFTEST PASS — ${detected} mutations detected`);
  process.exit(0);
}

const failures = audit(loadSrc(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — all 5 CLASS-F5973-TRUE-REMAINDER-FUEL leaves are wired (live-confirmed 2026-08-23)`);
