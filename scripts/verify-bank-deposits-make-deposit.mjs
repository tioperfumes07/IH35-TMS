#!/usr/bin/env node
/**
 * ROUND 312 B-2 — Bank Deposits (QBO Make Deposit) at /banking/deposits.
 * Undeposited receipts → one deposit JE (Dr bank / Cr UF) + accounting.deposits + lines;
 * cash-back optional; void = reversal; batch grid per §23.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bank-deposits-make-deposit";

const FILES = {
  migration: "db/migrations/202615171200_accounting_bank_deposits.sql",
  service: "apps/backend/src/accounting/bank-deposits.service.ts",
  routes: "apps/backend/src/accounting/bank-deposits.routes.ts",
  poster: "apps/backend/src/accounting/posting-engine.service.ts",
  page: "apps/frontend/src/pages/banking/MakeDepositPage.tsx",
  api: "apps/frontend/src/api/bankDeposits.ts",
  nav: "apps/frontend/src/pages/banking/BANKING_NAV_CONFIG.ts",
  routeManifest: "apps/frontend/src/router/route-manifest.ts",
  manifest: "apps/frontend/src/routes/manifest.tsx",
  displayId: "apps/backend/src/accounting/display-id.ts",
};

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function assertBankDeposits(srcs) {
  const fails = [];
  if (!/CREATE TABLE IF NOT EXISTS accounting\.deposits/.test(srcs.migration)) {
    fails.push("migration must CREATE accounting.deposits");
  }
  if (!/CREATE TABLE IF NOT EXISTS accounting\.deposit_lines/.test(srcs.migration)) {
    fails.push("migration must CREATE accounting.deposit_lines");
  }
  if (!/FORCE ROW LEVEL SECURITY/.test(srcs.migration)) {
    fails.push("migration must FORCE RLS");
  }
  if (!/refuse_financial_row_delete/.test(srcs.migration)) {
    fails.push("migration must WORM refuse DELETE");
  }
  if (!/createBankDeposit/.test(srcs.service) || !/voidBankDeposit/.test(srcs.service)) {
    fails.push("service must create + void deposits");
  }
  if (!/listUndepositedReceipts/.test(srcs.service)) {
    fails.push("service must list undeposited receipts");
  }
  if (!/postSourceTransactionInClientTx/.test(srcs.service) || !/bank_deposit/.test(srcs.service)) {
    fails.push("create must post via bank_deposit source type");
  }
  if (!/reversePostedSourceTransactionInClientTx/.test(srcs.service)) {
    fails.push("void must reverse via posting engine");
  }
  if (!/\/api\/v1\/accounting\/bank-deposits/.test(srcs.routes)) {
    fails.push("routes must expose /api/v1/accounting/bank-deposits");
  }
  if (!/"bank_deposit"/.test(srcs.poster) || !/buildBankDepositLines/.test(srcs.poster)) {
    fails.push("posting engine must handle bank_deposit");
  }
  if (!/DEPOSIT_ALREADY_AT_BANK/.test(srcs.poster) || !/live bank deposit/.test(srcs.poster)) {
    fails.push("match sweeps must skip receipts already on a live Make Deposit");
  }
  if (!/nextDepositDisplayId/.test(srcs.displayId) || !/DEP-/.test(srcs.displayId)) {
    fails.push("display-id must mint DEP-YYYY-NNNNN");
  }
  if (!/id: \"deposits\"/.test(srcs.nav) || !/"deposits"/.test(srcs.nav)) {
    fails.push("BANKING nav must include deposits tab");
  }
  if (!/deposits: \"\/banking\/deposits\"/.test(srcs.routeManifest)) {
    fails.push("BANKING_TAB_PATH.deposits must be /banking/deposits");
  }
  if (!/path=\"\/banking\/deposits\"/.test(srcs.manifest) || !/MakeDepositPage/.test(srcs.manifest)) {
    fails.push("manifest must mount MakeDepositPage at /banking/deposits");
  }
  if (!/data-page=\"make-deposit\"/.test(srcs.page)) {
    fails.push("MakeDepositPage must mark data-page=make-deposit");
  }
  if (!/Batch grid|fill-down|Duplicate/.test(srcs.page)) {
    fails.push("MakeDepositPage must include §23 batch grid (paste/fill-down/duplicate)");
  }
  if (!/createBankDeposit/.test(srcs.api) || !/voidBankDeposit/.test(srcs.api)) {
    fails.push("FE api client must create + void");
  }
  return fails;
}

const srcs = Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, read(rel)]));

if (process.argv.includes("--selftest")) {
  const fails = assertBankDeposits(srcs);
  if (fails.length) {
    console.error(`${LABEL} SELFTEST FAIL`);
    for (const f of fails) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  const bad = { ...srcs, nav: srcs.nav.replace(/id: \"deposits\"/g, 'id: "nope"') };
  if (!assertBankDeposits(bad).length) {
    console.error(`${LABEL} SELFTEST FAIL — planted missing deposits tab should fail`);
    process.exit(1);
  }
  console.log(`${LABEL} selftest PASS`);
  process.exit(0);
}

const fails = assertBankDeposits(srcs);
if (fails.length) {
  console.error(`${LABEL} FAIL`);
  for (const f of fails) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
