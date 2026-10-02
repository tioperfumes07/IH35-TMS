#!/usr/bin/env node
/**
 * B-5 RECLASSIFY / BATCH — ORDERS-2026-10-01-BANKING-REGISTER-SET §23–§24d.
 * Asserts Create→Other discoverability, Reclassify selection bar + vendor/customer modal,
 * and Batch transactions type strip on the existing engines.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LABEL = "verify-b5-reclassify-batch";

const TOPBAR = "apps/frontend/src/components/Topbar.tsx";
const RECLASSIFY = "apps/frontend/src/pages/accounting/ReclassifyTransactionsPage.tsx";
const BATCH = "apps/frontend/src/pages/accounting/batch/BatchExpensesPage.tsx";
const API = "apps/frontend/src/api/reclassify.ts";
const MANIFEST = "apps/frontend/src/routes/manifest.tsx";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertIncludes(src, needle, where) {
  if (!src.includes(needle)) throw new Error(`${where}: missing ${JSON.stringify(needle)}`);
}

function main() {
  const topbar = read(TOPBAR);
  const reclassify = read(RECLASSIFY);
  const batch = read(BATCH);
  const api = read(API);
  const manifest = read(MANIFEST);

  assertIncludes(topbar, "/accounting/batch-transactions", TOPBAR);
  assertIncludes(topbar, "/accounting/reclassify", TOPBAR);
  assertIncludes(topbar, "Batch transactions", TOPBAR);
  assertIncludes(topbar, "Reclassify transactions", TOPBAR);
  assertIncludes(topbar, "— Other —", TOPBAR);

  assertIncludes(reclassify, 'data-b5-reclassify="1"', RECLASSIFY);
  assertIncludes(reclassify, 'data-b5-period-balances="1"', RECLASSIFY);
  // BANK-F91048 — ORDERS §B-5 left pane PERIOD BALANCES (From/To)
  assertIncludes(reclassify, 'data-b5-period-from-to="1"', RECLASSIFY);
  assertIncludes(reclassify, 'data-testid="reclassify-period-from-to"', RECLASSIFY);
  assertIncludes(reclassify, 'data-testid="reclassify-period-from"', RECLASSIFY);
  assertIncludes(reclassify, 'data-testid="reclassify-period-to"', RECLASSIFY);
  assertIncludes(reclassify, "Accounts · period balances", RECLASSIFY);
  assertIncludes(reclassify, 'data-b5-selection-bar="1"', RECLASSIFY);
  assertIncludes(reclassify, "transaction line", RECLASSIFY);
  assertIncludes(reclassify, "selected:", RECLASSIFY);
  assertIncludes(reclassify, 'data-b5-reclassify-modal="1"', RECLASSIFY);
  assertIncludes(reclassify, "Change account to", RECLASSIFY);
  assertIncludes(reclassify, "Change class to", RECLASSIFY);
  assertIncludes(reclassify, 'data-b5-change-location="1"', RECLASSIFY);
  assertIncludes(reclassify, "Change location to", RECLASSIFY);
  assertIncludes(reclassify, 'data-b5-change-vendor-customer="1"', RECLASSIFY);
  assertIncludes(reclassify, "Change vendor/customer to", RECLASSIFY);
  assertIncludes(reclassify, "toEntityKind", RECLASSIFY);
  assertIncludes(reclassify, 'createKind="customer"', RECLASSIFY);
  assertIncludes(reclassify, "Find transactions", RECLASSIFY);
  assertIncludes(reclassify, "undoReclassifyBatch", RECLASSIFY);
  // BANK-F91042 — ORDERS §B-5 grid ACCOUNT NO. separate from ACCOUNT
  assertIncludes(reclassify, 'data-b5-account-no-col="1"', RECLASSIFY);
  assertIncludes(reclassify, 'data-testid="reclassify-col-account-no"', RECLASSIFY);
  assertIncludes(reclassify, "Account no.", RECLASSIFY);
  assertIncludes(reclassify, 'data-b5-account-no="1"', RECLASSIFY);
  assertIncludes(reclassify, "showNumber: false", RECLASSIFY);
  // House law: Account no. cell gated by showAccountNumbers (verify-account-number-hidden-by-default)
  if (!/data-b5-account-no="1">\{showAccountNumbers \?/.test(reclassify) && !/showAccountNumbers \? \(\(l\.account_number/.test(reclassify)) {
    throw new Error(`${RECLASSIFY}: Account no. cell must gate on showAccountNumbers`);
  }
  // BANK-F91043 — Go to page N of M on find results (ParityTable register chrome parity)
  assertIncludes(reclassify, 'data-b5-goto-page="1"', RECLASSIFY);
  assertIncludes(reclassify, "Go to page", RECLASSIFY);
  assertIncludes(reclassify, 'data-testid="reclassify-goto-page"', RECLASSIFY);
  assertIncludes(reclassify, "gotoPageDraft", RECLASSIFY);

  assertIncludes(batch, 'data-b5-batch-transactions="1"', BATCH);
  assertIncludes(batch, 'data-b5-batch-type="1"', BATCH);
  assertIncludes(batch, "Transaction type", BATCH);
  assertIncludes(batch, "Expenses / Checks", BATCH);
  assertIncludes(batch, "createExpense", BATCH);
  assertIncludes(batch, "parsePastedRows", BATCH);
  assertIncludes(batch, "fillDown", BATCH);
  // B-5 §23 — type strip hops to live deposit + settlement batch engines (never "not wired" stub).
  assertIncludes(batch, 'data-b5-batch-type-deposits="1"', BATCH);
  assertIncludes(batch, "/banking/deposits?batch=1", BATCH);
  assertIncludes(batch, 'data-b5-batch-type-settlements="1"', BATCH);
  assertIncludes(batch, "/driver-finance/settlements/batch", BATCH);
  if (/not wired yet|not in this grid yet/i.test(batch)) {
    throw new Error(`${BATCH}: still claims deposit/settlement batch unwired`);
  }

  const makeDeposit = read("apps/frontend/src/pages/banking/MakeDepositPage.tsx");
  assertIncludes(makeDeposit, 'data-b5-batch-deposits="1"', "MakeDepositPage");
  assertIncludes(makeDeposit, 'searchParams.get("batch") === "1"', "MakeDepositPage");
  assertIncludes(makeDeposit, "createBankDeposit", "MakeDepositPage");
  // BANK-F91049 — ORDERS §B-5 / QBO deposit footer [Save and close ▾]
  assertIncludes(makeDeposit, 'data-b5-deposit-save-close="1"', "MakeDepositPage");
  assertIncludes(makeDeposit, 'data-testid="b5-deposit-save-close"', "MakeDepositPage");
  assertIncludes(makeDeposit, "SaveDropdown", "MakeDepositPage");
  assertIncludes(makeDeposit, 'primaryLabel="Save and close"', "MakeDepositPage");
  assertIncludes(makeDeposit, "onSaveAndAddAnother", "MakeDepositPage");
  assertIncludes(makeDeposit, 'save_and_add_another: "Save and new"', "MakeDepositPage");
  assertIncludes(makeDeposit, 'navigate("/banking/deposits")', "MakeDepositPage");

  const batchSettlements = read("apps/frontend/src/pages/driver-finance/BatchSettlementsPage.tsx");
  assertIncludes(batchSettlements, 'data-b5-batch-settlements="1"', "BatchSettlementsPage");
  assertIncludes(batchSettlements, "postBatchSettlements", "BatchSettlementsPage");

  assertIncludes(api, "applyReclassify", API);
  assertIncludes(api, 'to_entity_type?: "customer" | "vendor"', API);

  assertIncludes(manifest, "/accounting/reclassify", MANIFEST);
  assertIncludes(manifest, "/accounting/batch-transactions", MANIFEST);

  console.log(`${LABEL}: PASS`);
}

function selftest() {
  try {
    main();
  } catch (err) {
    console.error(`${LABEL}: SELFTEST FAIL — ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
  console.log(`${LABEL}: SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) selftest();
else main();
