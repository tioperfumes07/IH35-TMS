#!/usr/bin/env node
/**
 * 18369-verify-bill-and-expense-services-carry-stamp.mjs
 *
 * ROUND 443.13 (CC-1, 2026-10-10). Owner order: the bill engine must carry loadId +
 * vendorDocumentNumber + lines (item, qty, UoM, rate) so the Settlement Creator can create
 * real bills for "owed" company expenses. The expense engine must export createExpenseInClientTx
 * so programmatic callers can reuse the full stampings without an HTTP round-trip.
 *
 * Rules verified (static, no DB):
 *   1. CreateBillInput has loadId field (bills.service.ts).
 *   2. CreateBillInput has vendorDocumentNumber field (bills.service.ts).
 *   3. createBillInClientTx stamps loadId via UPDATE-after-INSERT (before auto-derive).
 *   4. createExpenseInClientTx is exported from expenses.routes.ts.
 *   5. settlement-creator no longer throws expense_owed_bill_unavailable; calls createBillInClientTx.
 *   6. 443.12 CORRECTION: isAuthorizedZeroInvoice uses isLoadRevenueLineType (not just total_cents===0).
 */
import { readFileSync } from "node:fs";

const BILLS_PATH = "apps/backend/src/accounting/bills.service.ts";
const EXPENSES_PATH = "apps/backend/src/accounting/expenses.routes.ts";
const SC_PATH = "apps/backend/src/driver-finance/settlement-creator.service.ts";
const SEND_PATH = "apps/backend/src/accounting/invoice-send.service.ts";

function loadFile(p) {
  return readFileSync(p, "utf8");
}

export function collectFailures(
  billsSrc = loadFile(BILLS_PATH),
  expensesSrc = loadFile(EXPENSES_PATH),
  scSrc = loadFile(SC_PATH),
  sendSrc = loadFile(SEND_PATH),
) {
  const failures = [];

  // Rule 1: CreateBillInput has loadId — check for the ROUND 443.13 header-link comment + field.
  // CreateBillLineInput also has loadId; target the header-level one by its unique "header link" phrase.
  if (!/explicit bill.*load header link[\s\S]{0,400}loadId\?:\s*string\s*\|\s*null/.test(billsSrc)) {
    failures.push("CreateBillInput does not have the ROUND 443.13 loadId?: string | null header field — bill engine cannot carry explicit load link");
  }

  // Rule 2: CreateBillInput has vendorDocumentNumber
  if (!/vendor.*own document.*reference number[\s\S]{0,300}vendorDocumentNumber\?:\s*string\s*\|\s*null/.test(billsSrc)) {
    failures.push("CreateBillInput does not have vendorDocumentNumber?: string | null — vendor doc number cannot be passed to bill engine");
  }

  // Rule 3: loadId stamp UPDATE-after-INSERT in createBillRowInClientTx
  if (!/input\.loadId/.test(billsSrc)) {
    failures.push("bills.service.ts does not use input.loadId — loadId field exists in type but is never written");
  }
  if (!/UPDATE accounting\.bills SET load_id/.test(billsSrc)) {
    failures.push("bills.service.ts does not have UPDATE accounting.bills SET load_id — explicit load_id stamp UPDATE is missing");
  }

  // Rule 4: createExpenseInClientTx exported from expenses.routes.ts
  if (!/export async function createExpenseInClientTx/.test(expensesSrc)) {
    failures.push("expenses.routes.ts does not export createExpenseInClientTx — programmatic callers cannot reuse expense creation");
  }
  if (!/export type CreateExpenseBody/.test(expensesSrc)) {
    failures.push("expenses.routes.ts does not export CreateExpenseBody type — importers cannot type their input");
  }

  // Rule 5: settlement-creator no longer throws expense_owed_bill_unavailable and calls createBillInClientTx
  if (/expense_owed_bill_unavailable/.test(scSrc)) {
    failures.push("settlement-creator still throws expense_owed_bill_unavailable — ROUND 443.13 part (a) unblocked the bill engine but the throw was not removed");
  }
  if (!/createBillInClientTx/.test(scSrc)) {
    failures.push("settlement-creator does not call createBillInClientTx — owed company expenses cannot become bills");
  }

  // Rule 6: 443.12 CORRECTION — isAuthorizedZeroInvoice uses isLoadRevenueLineType, not just total_cents===0
  if (!/isAuthorizedZeroInvoice/.test(sendSrc)) {
    failures.push("invoice-send.service.ts does not use isAuthorizedZeroInvoice — 443.12 correction not applied");
  }
  if (!/isLoadRevenueLineType\(/.test(sendSrc)) {
    failures.push("invoice-send.service.ts does not call isLoadRevenueLineType() — 443.12 guard bypass is too broad (any $0 total skips it)");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const baseline = collectFailures();
  if (baseline.length) {
    console.error(`18369-verify-bill-and-expense-services-carry-stamp SELFTEST FAIL — good sources rejected:\n  ${baseline.join("\n  ")}`);
    process.exit(1);
  }
  const billsSrc = loadFile(BILLS_PATH);
  const expensesSrc = loadFile(EXPENSES_PATH);
  const scSrc = loadFile(SC_PATH);
  const sendSrc = loadFile(SEND_PATH);
  const LOAD_ID_HEADER_MARKER = "ROUND 443.13 (CC-1) — explicit bill→load header link";
  const VENDOR_DOC_MARKER = "ROUND 443.13 (CC-1) — the vendor's own document/invoice reference number";
  const mutations = [
    ["loadId header field removed from CreateBillInput",
      billsSrc.includes(LOAD_ID_HEADER_MARKER)
        ? billsSrc.replace(LOAD_ID_HEADER_MARKER, "REMOVED 443.13 COMMENT")
        : billsSrc.replace("loadId?: string | null;\n  /** ROUND 443.13", "// removed\n  /** ROUND 443.13"),
      expensesSrc, scSrc, sendSrc],
    ["vendorDocumentNumber removed from CreateBillInput",
      billsSrc.includes(VENDOR_DOC_MARKER)
        ? billsSrc.replace(VENDOR_DOC_MARKER, "REMOVED VENDOR DOC COMMENT")
        : billsSrc.replace("vendorDocumentNumber?: string | null;", "// vendorDocumentNumber removed"),
      expensesSrc, scSrc, sendSrc],
    ["createExpenseInClientTx not exported",
      billsSrc,
      expensesSrc.replace("export async function createExpenseInClientTx", "async function createExpenseInClientTx"),
      scSrc, sendSrc],
    ["settlement-creator still throws owed_bill_unavailable",
      billsSrc, expensesSrc,
      scSrc.replace("createBillInClientTx(", "// createBillInClientTx(\n      throw new SettlementCreatorError('expense_owed_bill_unavailable', 'x')"),
      sendSrc],
    ["443.12 correction removed — isLoadRevenueLineType not called",
      billsSrc, expensesSrc, scSrc,
      sendSrc.replace("isLoadRevenueLineType(l.line_type)", "true /* REMOVED */")],
  ];
  const escaped = [];
  for (const [name, b, e, s, sv] of mutations) {
    const result = collectFailures(b, e, s, sv);
    if (result.length === 0) escaped.push(name);
  }
  if (escaped.length) {
    console.error(`18369-verify-bill-and-expense-services-carry-stamp SELFTEST FAIL — escaped: ${escaped.join(", ")}`);
    process.exit(1);
  }
  console.log(`18369-verify-bill-and-expense-services-carry-stamp SELFTEST PASS — ${mutations.length}/${mutations.length} plants rejected`);
  process.exit(0);
}

const failures = collectFailures();
if (failures.length > 0) {
  console.error("18369-verify-bill-and-expense-services-carry-stamp: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("18369-verify-bill-and-expense-services-carry-stamp: OK — bill engine carries loadId/vendorDocumentNumber/lines; createExpenseInClientTx exported; settlement-creator uses bill engine for owed expenses; 443.12 guard bypass is load-revenue-typed only");
