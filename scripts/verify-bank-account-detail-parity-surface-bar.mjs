#!/usr/bin/env node
/**
 * BANK-F3556 — BankAccountDetail transfers + reconciliation reverse lists must use
 * ParityTable (Search+Range+gear), not raw HTML tables that skip the surface bar.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/banking/BankAccountDetail.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

/** Pure over the page text (defaults to the tracked file); the selftest passes a planted string. */
export function check(src = fs.readFileSync(path.join(ROOT, PAGE), "utf8")) {
  assert(src.includes("ParityTable"), "BankAccountDetail: must use ParityTable");
  assert(src.includes('storageKey="bank-account-detail-transfers"'), "BankAccountDetail: transfers storageKey");
  assert(src.includes('storageKey="bank-account-detail-reconciliation"'), "BankAccountDetail: reconciliation storageKey");
  assert(src.includes('tableTestId="bank-account-detail-transfers-table"'), "BankAccountDetail: transfers tableTestId");
  assert(
    src.includes('tableTestId="bank-account-detail-reconciliation-table"'),
    "BankAccountDetail: reconciliation tableTestId",
  );
  assert(src.includes('data-testid="bank-account-detail-transfers"'), "BankAccountDetail: keep transfers section test id");
  assert(
    src.includes('data-testid="bank-account-detail-reconciliation-sessions"'),
    "BankAccountDetail: keep reconciliation section test id",
  );
  assert(!/<table\b/.test(src), "BankAccountDetail: must not use raw HTML table");
  assert(src.includes("listTransfers"), "BankAccountDetail: keep transfers API");
  assert(src.includes("getReconciliationSessions"), "BankAccountDetail: keep reconciliation API");
  assert(src.includes("BankingTransactionsDesignView"), "BankAccountDetail: keep live register mount");
}

function selftest() {
  check();
  const planted = [
    "export function BankAccountDetailPage() {",
    '  return <table className="w-full" data-testid="bank-account-detail-transfers-table"><tbody /></table>;',
    "}",
    "",
  ].join("\n");
  let failed = false;
  try {
    check(planted);
  } catch {
    failed = true;
  }
  assert(failed, "selftest: expected FAIL on raw HTML table");
  console.log("verify-bank-account-detail-parity-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) selftest();
else {
  check();
  console.log("verify-bank-account-detail-parity-surface-bar PASS");
}
