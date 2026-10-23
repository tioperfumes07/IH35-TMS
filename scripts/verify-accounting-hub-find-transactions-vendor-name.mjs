#!/usr/bin/env node
/**
 * ROUND 443.267 board 2 — Accounting home must match the approved board layout.
 * Replaces the retired FIND TRANSACTIONS vendor-name guard (that panel is not on the board).
 *
 * Asserts AccountingHubPage.tsx wires the board sections + engines:
 *   KPI strip · 2026 close calendar · Receivables aging · Cash pulse · Settlements open
 * and does not resurrect Find Transactions / Trial Balance / P&L hub panels.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const FILE = "apps/frontend/src/pages/accounting/AccountingHubPage.tsx";

function stripComments(text) {
  return String(text ?? "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

export function check(text) {
  const failures = [];
  const body = stripComments(text);

  const required = [
    ["Receivables aging", /Receivables aging/],
    ["Cash pulse · operating account", /Cash pulse · operating account/],
    ["Settlements open", /Settlements open/],
    ["close calendar title", /close — .* past months closed/],
    ["getArAgingReport", /getArAgingReport/],
    ["getActualVsProjected", /getActualVsProjected/],
    ["listTours", /listTours\(/],
    ["getAccountingPeriods", /getAccountingPeriods/],
    ["getMonthCloseStatus", /getMonthCloseStatus/],
    ["isVoidInvoice open invoices", /isVoidInvoice/],
    ["invoiceOpenCentsForDisplay", /invoiceOpenCentsForDisplay/],
  ];
  for (const [label, re] of required) {
    if (!re.test(body)) {
      failures.push(`${FILE} missing board requirement: ${label}`);
    }
  }

  const forbidden = [
    ["Find Transactions panel title", /homePanel\(\s*["']Find Transactions["']/],
    ["TRIAL BALANCE hub panel", /homePanel\(\s*["']TRIAL BALANCE["']/],
    ["PROFIT & LOSS hub panel", /homePanel\(\s*["']PROFIT & LOSS["']/],
  ];
  for (const [label, re] of forbidden) {
    if (re.test(body)) {
      failures.push(`${FILE} still contains retired hub chrome: ${label}`);
    }
  }

  return failures;
}

function run() {
  const text = fs.readFileSync(path.join(root, FILE), "utf8");
  const failures = check(text);
  if (failures.length > 0) {
    console.error("FAIL: accounting-hub-board-layout (443.267)");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    "PASS: Accounting Hub board layout — close calendar · Receivables aging · Cash pulse · Settlements open (engines wired)"
  );
}

function selftest() {
  const text = fs.readFileSync(path.join(root, FILE), "utf8");
  const offender = text.replace(/Receivables aging/g, "AR widget");
  if (offender === text) {
    console.error("FAIL(selftest): offender mutation did not change the source — pattern out of sync");
    process.exit(1);
  }
  const failures = check(offender);
  if (failures.length === 0) {
    console.error("FAIL(selftest): planted offender (removed Receivables aging) was NOT caught");
    process.exit(1);
  }
  console.log("PASS(selftest): planted regression correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
