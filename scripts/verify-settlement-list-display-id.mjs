#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assert(cond, msg, errors) {
  if (!cond) errors.push(msg);
}

export function run() {
  const errors = [];
  const migration = read("db/migrations/202608101200_add_display_id_to_driver_settlement_with_debt_view.sql");
  const routes = read("apps/backend/src/driver-finance/settlements.routes.ts");
  const api = read("apps/frontend/src/api/driverFinance.ts");
  const table = read("apps/frontend/src/pages/driver-finance/components/SettlementsTable.tsx");

  assert(migration.includes("s.display_id"), "migration must add s.display_id to the view", errors);
  assert(migration.includes("GRANT SELECT ON views.driver_settlement_with_debt"), "migration must grant SELECT on the view", errors);
  assert(routes.includes("views.driver_settlement_with_debt"), "settlements.routes.ts must consume the view", errors);

  const listRowBlock = api.match(/export type SettlementListRow = \{[\s\S]*?\n\};/)?.[0] ?? "";
  assert(/\n  display_id: string \| null;/.test(listRowBlock), "SettlementListRow type must expose display_id field", errors);

  assert(table.includes('key: "settlement_display_id"') || table.includes("display_id"), "SettlementsTable must render display_id", errors);

  const detail = read("apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx");
  const header = read("apps/frontend/src/pages/driver-finance/components/SettlementHeader.tsx");
  assert(detail.includes("settlementDisplayId"), "SettlementDetailPage must pass settlement display_id to header", errors);
  assert(header.includes("settlementDisplayId"), "SettlementHeader must render settlement display_id", errors);
  assert(detail.includes("showManualPaidDraftBanner"), "SettlementDetailPage must surface manual_paid draft honesty banner", errors);

  // FE Render build unblock (ih35-tms-web exit 2): Manual Paid chip must type-check through setFilter.
  const settlementsPage = read("apps/frontend/src/pages/driver-finance/SettlementsPage.tsx");
  const setFilterSig =
    settlementsPage.match(/function setFilter\(\s*state:\s*([\s\S]*?),\s*\n\s*searchParams:/)?.[1] ?? "";
  assert(
    /"manual_paid"/.test(setFilterSig),
    "SettlementsPage setFilter must accept payment_state 'manual_paid' (tsc exit 2 otherwise)",
    errors
  );

  // SettlementListRow.display_id is required — EarningsTab fixtures must include it or tsc -b fails.
  const earningsTest = read("apps/frontend/src/components/drivers/__tests__/EarningsTab.test.tsx");
  assert(
    /display_id:\s*"S-/.test(earningsTest),
    "EarningsTab.test.tsx settlement fixtures must include display_id (SettlementListRow required field)",
    errors
  );

  return errors;
}

function selftest() {
  const apiPath = path.join(ROOT, "apps/frontend/src/api/driverFinance.ts");
  const pagePath = path.join(ROOT, "apps/frontend/src/pages/driver-finance/SettlementsPage.tsx");
  const apiBackup = fs.readFileSync(apiPath, "utf8");
  const pageBackup = fs.readFileSync(pagePath, "utf8");
  try {
    const patched = apiBackup.replace(
      /(export type SettlementListRow = \{[\s\S]*?)(\n  display_id: string \| null;)/,
      "$1"
    );
    fs.writeFileSync(apiPath, patched, "utf8");
    const planted = run();
    if (!planted.some((e) => e.includes("SettlementListRow"))) {
      throw new Error("planted type removal not detected");
    }

    // Plant: drop manual_paid from setFilter's state union only — must FAIL.
    const pagePlanted = pageBackup.replace(
      /(function setFilter\(\s*state:\s*[\s\S]*?)\| "manual_paid"/,
      "$1"
    );
    fs.writeFileSync(pagePath, pagePlanted, "utf8");
    // Restore API so this plant is isolated to the setFilter check.
    fs.writeFileSync(apiPath, apiBackup, "utf8");
    const plantedPage = run();
    if (!plantedPage.some((e) => e.includes("manual_paid"))) {
      throw new Error("planted setFilter manual_paid removal not detected");
    }

    console.log(`[verify-settlement-list-display-id] SELFTEST PASS (${planted.length}+${plantedPage.length} planted failures detected)`);
  } finally {
    fs.writeFileSync(apiPath, apiBackup, "utf8");
    fs.writeFileSync(pagePath, pageBackup, "utf8");
  }
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const errors = run();
  if (errors.length) {
    console.error("\n[verify-settlement-list-display-id] FAILED:\n");
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }
  console.log("[verify-settlement-list-display-id] All checks passed ✓");
}

main();
