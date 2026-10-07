#!/usr/bin/env node
/** MATRIX-BUILT-OPTIONAL — live-only / invariant ratchet guard; no surface wiring leaf to register. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readDisk(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assert(cond, msg, errors) {
  if (!cond) errors.push(msg);
}

// overrides: {relPath: plantedText} so --selftest plants into a string; no file is written.
export function run(overrides = {}) {
  const errors = [];
  const read = (rel) => overrides[rel] ?? readDisk(rel);
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
  assert(!header.includes("text-[11px]"), "SettlementHeader leftover chrome must use text-xs, not text-[11px]", errors);
  assert(!header.includes("#8A92AB") && !header.includes("#334155"), "SettlementHeader leftover chrome must not use off-scale #334155 / #8A92AB", errors);
  assert(detail.includes("showManualPaidDraftBanner"), "SettlementDetailPage must surface manual_paid draft honesty banner", errors);

  // FE Render build unblock (ih35-tms-web exit 2): Manual Paid chip must type-check through the multi-select payment_state filter.
  const settlementsPage = read("apps/frontend/src/pages/driver-finance/SettlementsPage.tsx");
  assert(
    /type PaymentStateValue =[\s\S]*?\| "manual_paid"[\s\S]*?;/.test(settlementsPage),
    "SettlementsPage PaymentStateValue union must include 'manual_paid' (tsc exit 2 otherwise)",
    errors
  );
  assert(
    /allowed\.has\(s as PaymentStateValue\)/.test(settlementsPage) || /allowed\.has\(s\)/.test(settlementsPage),
    "SettlementsPage parsePaymentStates must allow manual_paid through the allowed set",
    errors
  );
  assert(!settlementsPage.includes("text-[11px]"), "SettlementsPage leftover chrome must use text-xs, not text-[11px]", errors);
  assert(!settlementsPage.includes("#8A92AB") && !settlementsPage.includes("#334155"), "SettlementsPage leftover chrome must not use off-scale #334155 / #8A92AB", errors);

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
  const API_REL = "apps/frontend/src/api/driverFinance.ts";
  const PAGE_REL = "apps/frontend/src/pages/driver-finance/SettlementsPage.tsx";
  const HEADER_REL = "apps/frontend/src/pages/driver-finance/components/SettlementHeader.tsx";
  const apiBackup = readDisk(API_REL);
  const pageBackup = readDisk(PAGE_REL);
  const headerBackup = readDisk(HEADER_REL);

  const patched = apiBackup.replace(
    /(export type SettlementListRow = \{[\s\S]*?)(\n  display_id: string \| null;)/,
    "$1"
  );
  const planted = run({ [API_REL]: patched });
  if (!planted.some((e) => e.includes("SettlementListRow"))) {
    throw new Error("planted type removal not detected");
  }

  // Plant: drop manual_paid from PaymentStateValue union and allowed set — must FAIL.
  const pagePlanted = pageBackup
    .replace(/(\| "manual_paid")/, "")
    .replace(
      /const allowed = new Set\(PAYMENT_STATE_OPTIONS\.map\(\(o\) => o\.value\)\);/,
      "const allowed = new Set(PAYMENT_STATE_OPTIONS.map((o) => o.value).filter((v) => v !== \"manual_paid\"));"
    );
  const plantedPage = run({ [PAGE_REL]: pagePlanted });
  if (!plantedPage.some((e) => e.includes("manual_paid"))) {
    throw new Error("planted PaymentStateValue manual_paid removal not detected");
  }

  const plantedHeader = run({ [HEADER_REL]: `${headerBackup}\n<div className="text-[11px] text-[#8A92AB]">plant</div>` });
  if (!plantedHeader.some((e) => e.includes("text-[11px]") || e.includes("#8A92AB") || e.includes("#334155"))) {
    throw new Error("planted SettlementHeader leftover tokens not detected");
  }

  const plantedList = run({ [PAGE_REL]: `${pageBackup}\n<div className="text-[11px] text-[#8A92AB]">plant</div>` });
  if (!plantedList.some((e) => e.includes("SettlementsPage leftover"))) {
    throw new Error("planted SettlementsPage leftover tokens not detected");
  }

  console.log(`[verify-settlement-list-display-id] SELFTEST PASS (${planted.length}+${plantedPage.length}+${plantedHeader.length}+${plantedList.length} planted failures detected)`);
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
