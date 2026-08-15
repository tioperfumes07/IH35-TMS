#!/usr/bin/env node
/**
 * BANK-F3578 — BankTxCategorizationPage uncategorized grid must use ParityTable
 * (Search+Range+gear + selectable), not a raw HTML table.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/banking/BankTxCategorizationPage.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check() {
  const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  assert(src.includes("ParityTable"), "BankTxCategorizationPage: must use ParityTable");
  assert(src.includes('storageKey="bank-tx-categorization-uncategorized"'), "BankTxCategorizationPage: storageKey");
  assert(src.includes('tableTestId="bank-tx-categorization-table"'), "BankTxCategorizationPage: tableTestId");
  assert(src.includes("selectable"), "BankTxCategorizationPage: must keep selectable bulk");
  assert(src.includes("getBankingUncategorized"), "BankTxCategorizationPage: keep uncategorized API");
  assert(src.includes("ReferenceSelect"), "BankTxCategorizationPage: keep CoA ReferenceSelect");
  assert(!/<table\b/.test(src), "BankTxCategorizationPage: must not use raw HTML table");
}

function selftest() {
  check();
  const filePath = path.join(ROOT, PAGE);
  const good = fs.readFileSync(filePath, "utf8");
  const planted = [
    "export function BankTxCategorizationPage() {",
    '  return <table className="min-w-full" data-testid="bank-tx-categorization-table"><tbody /></table>;',
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
  console.log("verify-bank-tx-categorization-parity-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) selftest();
else {
  check();
  console.log("verify-bank-tx-categorization-parity-surface-bar PASS");
}
