#!/usr/bin/env node
/**
 * verify-factoring-r315-reserves-shared.mjs
 * ROUND 315 / Lead B7 (2026-10-01):
 *  - FactoringReservesSharedPanel is the ONE reserves/deductions (CCG) surface
 *  - Mounted in FactoringHome reserve tab AND BankingHome
 *  - Money via formatUsdCents; actions: Categorize / Transfer / Apply
 *  - Equipment loans from banking.equipment_loans API (listEquipmentLoans)
 *  - Purchases escrow/cash from listFactoringPurchases (ledger)
 *
 * --selftest mutates load-bearing facts and requires FAIL; clean sources PASS.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const errors = [];
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const PANEL = "apps/frontend/src/components/factoring/FactoringReservesSharedPanel.tsx";
const HOME = "apps/frontend/src/pages/factoring/FactoringHome.tsx";
const BANKING = "apps/frontend/src/pages/banking/BankingHome.tsx";

function analyze(src) {
  const e = [];
  const { panel, home, banking } = src;

  if (!panel.includes("export function FactoringReservesSharedPanel")) {
    e.push("Shared panel must export FactoringReservesSharedPanel");
  }
  if (!panel.includes("listFactoringPurchases")) {
    e.push("Shared panel must read posted purchases (escrow/cash) via listFactoringPurchases");
  }
  if (!panel.includes("getReserveBalanceHistory")) {
    e.push("Shared panel must read reserve ledger via getReserveBalanceHistory");
  }
  if (!panel.includes("listEquipmentLoans")) {
    e.push("Shared panel must read CCG/equipment loans via listEquipmentLoans");
  }
  if (!panel.includes("formatUsdCents")) {
    e.push("Shared panel must format money via formatUsdCents (never dollars Intl on cents)");
  }
  for (const action of ["action-categorize", "action-transfer", "action-apply"]) {
    if (!panel.includes(action)) {
      e.push(`Shared panel must expose ${action} deep-link`);
    }
  }
  if (!panel.includes('host: "factoring" | "banking"')) {
    e.push("Shared panel must accept host factoring|banking for mirrored mounts");
  }
  if (!panel.includes("banking-factoring-reserves-shared") || !panel.includes("factoring-reserves-shared")) {
    e.push("Shared panel must emit banking-factoring-reserves-shared and factoring-reserves-shared testids");
  }

  if (!home.includes("FactoringReservesSharedPanel")) {
    e.push("FactoringHome must import FactoringReservesSharedPanel");
  }
  if (!home.includes('host="factoring"')) {
    e.push("FactoringHome reserve tab must mount host=factoring");
  }
  if (!home.includes('data-testid="factoring-reserve-report"')) {
    e.push("FactoringHome must keep factoring-reserve-report wrapper");
  }

  if (!banking.includes("FactoringReservesSharedPanel")) {
    e.push("BankingHome must import FactoringReservesSharedPanel");
  }
  if (!banking.includes('host="banking"')) {
    e.push("BankingHome must mount host=banking");
  }
  // Rule 07 + existing liability guard: compact card stays.
  if (!banking.includes("FactoringSummaryCard")) {
    e.push("BankingHome must keep FactoringSummaryCard (Rule 07 / liability guard)");
  }

  return e;
}

function main() {
  const selftest = process.argv.includes("--selftest");
  const src = {
    panel: read(PANEL),
    home: read(HOME),
    banking: read(BANKING),
  };

  if (selftest) {
    // Plant: drop banking mount — must FAIL.
    const planted = {
      ...src,
      banking: src.banking.replace(/FactoringReservesSharedPanel/g, "NOT_SHARED_PANEL"),
    };
    const plantedErrors = analyze(planted);
    if (plantedErrors.length === 0) {
      console.error("SELFTEST FAIL: planted banking mount removal did not trip the guard");
      process.exit(1);
    }
    console.log("SELFTEST PASS: planted defect caught:");
    for (const e of plantedErrors) console.log(`  - ${e}`);
    process.exit(0);
  }

  errors.push(...analyze(src));
  if (errors.length) {
    console.error("FAIL verify-factoring-r315-reserves-shared:");
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log("PASS verify-factoring-r315-reserves-shared");
  console.log("  FactoringHome reserve + BankingHome both mount FactoringReservesSharedPanel");
  console.log("  ledger: purchases escrow/cash + reserve history + equipment loans; formatUsdCents");
}

main();
