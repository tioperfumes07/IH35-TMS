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
  fuelRoute: "apps/backend/src/fuel/fuel-transactions.routes.ts",
  importModal: "apps/frontend/src/pages/fuel/components/ImportFuelTransactionsModal.tsx",
  uploadModal: "apps/frontend/src/pages/fuel/components/UploadLovesPricesModal.tsx",
  lovesRoute: "apps/backend/src/fuel/loves-upload.routes.ts",
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
  if (!/driver_company_authorizations fuel_create_driver_dca/.test(src.fuelRoute) || !/driver_not_found_for_company/.test(src.fuelRoute)) {
    failures.push(`${FILES.fuelRoute}: manual create must reject drivers outside the selected company authorization boundary`);
  }
  if (!/COALESCE\(fuel_create_unit\.currently_leased_to_company_id, fuel_create_unit\.owner_company_id\) = \$2::uuid/.test(src.fuelRoute) || !/unit_not_found_for_company/.test(src.fuelRoute)) {
    failures.push(`${FILES.fuelRoute}: manual create must reject units outside the selected owner/lease company`);
  }
  if (!/FROM mdata\.vendors fuel_create_vendor[\s\S]*fuel_create_vendor\.operating_company_id = \$2::uuid[\s\S]*fuel_create_vendor\.deactivated_at IS NULL/.test(src.fuelRoute) || !/vendor_not_found_for_company/.test(src.fuelRoute)) {
    failures.push(`${FILES.fuelRoute}: manual create must reject vendors outside the selected active company catalog`);
  }

  if (!/await importFuelTransactions\(operatingCompanyId/.test(src.importModal)) {
    failures.push(`${FILES.importModal}: must call importFuelTransactions(operatingCompanyId, ...) (connectivity)`);
  }
  if (!/res\.dead_letters\} rejected/.test(src.importModal) || !/res\.dead_letters > 0 \? "error" : "success"/.test(src.importModal)) {
    failures.push(`${FILES.importModal}: must expose parser-rejected rows as an error-bearing completion, never silent success`);
  }

  if (!/await uploadLovesPrices\(operatingCompanyId/.test(src.uploadModal)) {
    failures.push(`${FILES.uploadModal}: must call uploadLovesPrices(operatingCompanyId, ...) (connectivity)`);
  }
  if (/\.catch\(\(\) => \(\{ rowCount: 0 \}\)\)/.test(src.lovesRoute)) {
    failures.push(`${FILES.lovesRoute}: database write failures must abort, never be counted as skipped success`);
  }
  if (!/await client\.query<\{ inserted: boolean \}>\([\s\S]*INSERT INTO fuel\.loves_prices_daily[\s\S]*ON CONFLICT \(operating_company_id, effective_date, station_name, station_address\)[\s\S]*DO UPDATE SET[\s\S]*RETURNING \(xmax = 0\) AS inserted/.test(src.lovesRoute)) {
    failures.push(`${FILES.lovesRoute}: must retain the atomic company-keyed Loves price upsert writer`);
  }
  if (!/\[\s*companyId,\s*row\.station_uuid \?\? null,/.test(src.lovesRoute)) {
    failures.push(`${FILES.lovesRoute}: Loves price upsert must bind the selected company as parameter $1`);
  }

  if (!/getFuelSavingsSummary/.test(src.plannerHome) || !/SavingsPanel/.test(src.plannerHome)) {
    failures.push(`${FILES.plannerHome}: must mount SavingsPanel wired to getFuelSavingsSummary (connectivity)`);
  }
  if (!/savingsQuery\.isError \? \(\s*<div data-testid="fuel-history-savings-error">\s*<ListErrorBanner onRetry=\{\(\) => void savingsQuery\.refetch\(\)\}/.test(src.plannerHome)) {
    failures.push(`${FILES.plannerHome}: History savings must show a retryable error instead of fake $0 values`);
  }
  if (!/savingsQuery\.isError \? \(\s*<div data-testid="fuel-planner-savings-error">\s*<ListErrorBanner onRetry=\{\(\) => void savingsQuery\.refetch\(\)\}/.test(src.plannerHome)) {
    failures.push(`${FILES.plannerHome}: Planner savings must show a retryable error instead of fake $0 values`);
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
    { key: "fuelRoute", from: "driver_company_authorizations fuel_create_driver_dca", to: "driver_company_authorizations REMOVED_driver_dca" },
    { key: "fuelRoute", from: "driver_not_found_for_company", to: "driver_not_scoped" },
    { key: "fuelRoute", from: "COALESCE(fuel_create_unit.currently_leased_to_company_id, fuel_create_unit.owner_company_id) = $2::uuid", to: "fuel_create_unit.owner_company_id IS NOT NULL" },
    { key: "fuelRoute", from: "unit_not_found_for_company", to: "unit_not_scoped" },
    { key: "fuelRoute", from: "vendor_not_found_for_company", to: "vendor_not_scoped" },
    { key: "fuelRoute", from: "fuel_create_vendor.operating_company_id = $2::uuid", to: "fuel_create_vendor.operating_company_id IS NOT NULL" },
    { key: "importModal", from: "await importFuelTransactions(operatingCompanyId", to: "await importFuelTransactions(REMOVED" },
    { key: "importModal", from: "${res.dead_letters} rejected", to: "0 rejected" },
    { key: "importModal", from: 'res.dead_letters > 0 ? "error" : "success"', to: '"success"' },
    { key: "uploadModal", from: "await uploadLovesPrices(operatingCompanyId", to: "await uploadLovesPrices(REMOVED" },
    { key: "lovesRoute", from: "ON CONFLICT (operating_company_id, effective_date, station_name, station_address)", to: "ON CONFLICT (effective_date, station_name, station_address)" },
    { key: "lovesRoute", from: "RETURNING (xmax = 0) AS inserted", to: "RETURNING false AS inserted" },
    { key: "lovesRoute", from: "[\n              companyId,\n              row.station_uuid ?? null,", to: "[\n              null,\n              row.station_uuid ?? null," },
    { key: "plannerHome", from: "SavingsPanel", to: "SavingsPane1" },
    { key: "plannerHome", from: "fuel-history-savings-error", to: "fuel-history-savings-removed" },
    { key: "plannerHome", from: "fuel-planner-savings-error", to: "fuel-planner-savings-removed" },
    { key: "plannerHome", from: "savingsQuery.refetch()", to: "Promise.resolve()" },
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
