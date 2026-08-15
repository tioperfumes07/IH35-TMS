#!/usr/bin/env node
/**
 * ACCT-F3580 — CreateMultipleBillsPage draft grid must use ParityTable
 * (Search+Range+gear), not a raw HTML table.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/accounting/CreateMultipleBillsPage.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check() {
  const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  assert(src.includes("ParityTable"), "CreateMultipleBillsPage: must use ParityTable");
  assert(src.includes('storageKey="create-multiple-bills-draft"'), "CreateMultipleBillsPage: storageKey");
  assert(src.includes('tableTestId="create-multiple-bills-table"'), "CreateMultipleBillsPage: tableTestId");
  assert(src.includes("createVendorBill"), "CreateMultipleBillsPage: keep createVendorBill");
  assert(src.includes("expense_account_id"), "CreateMultipleBillsPage: keep expense account column");
  assert(src.includes("dueDateFromBillTerms"), "CreateMultipleBillsPage: keep due-date terms helper");
  assert(!/<table\b/.test(src), "CreateMultipleBillsPage: must not use raw HTML table");
}

function selftest() {
  check();
  const filePath = path.join(ROOT, PAGE);
  const good = fs.readFileSync(filePath, "utf8");
  const planted = [
    "export function CreateMultipleBillsPage() {",
    '  return <table className="min-w-full" data-testid="create-multiple-bills-table"><tbody /></table>;',
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
  console.log("verify-create-multiple-bills-parity-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) selftest();
else {
  check();
  console.log("verify-create-multiple-bills-parity-surface-bar PASS");
}
