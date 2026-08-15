#!/usr/bin/env node
/**
 * CUST-F3560 — CustomerDetail Recent Invoices must use ParityTable
 * (Search+Range+gear), not a raw HTML table that skips the surface bar.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/CustomerDetail.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check() {
  const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  assert(src.includes("ParityTable"), "CustomerDetail: must use ParityTable");
  assert(src.includes('storageKey="customer-detail-recent-invoices"'), "CustomerDetail: recent invoices storageKey");
  assert(src.includes('tableTestId="customer-detail-recent-invoices-table"'), "CustomerDetail: recent invoices tableTestId");
  assert(src.includes('storageKey="customer-detail-payments"'), "CustomerDetail: keep payments ParityTable");
  assert(src.includes('storageKey="customer-detail-loads"'), "CustomerDetail: keep loads ParityTable");
  assert(!/<table\b/.test(src), "CustomerDetail: must not use raw HTML table");
  assert(src.includes("listInvoices"), "CustomerDetail: keep invoices API");
  assert(src.includes("Recent Invoices"), "CustomerDetail: keep Recent Invoices heading");
}

function selftest() {
  check();
  const filePath = path.join(ROOT, PAGE);
  const good = fs.readFileSync(filePath, "utf8");
  const planted = [
    "export function CustomerDetail() {",
    '  return <table className="min-w-full" data-testid="customer-detail-recent-invoices-table"><tbody /></table>;',
    "}",
    "",
  ].join("\n");
  fs.writeFileSync(filePath, planted);
  let failed = false;
  try {
    check();
  } catch {
    failed = true;
  }
  fs.writeFileSync(filePath, good);
  assert(failed, "selftest: expected FAIL on raw HTML table");
  console.log("verify-customer-detail-invoices-parity-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) selftest();
else {
  check();
  console.log("verify-customer-detail-invoices-parity-surface-bar PASS");
}
