#!/usr/bin/env node
/**
 * BANK-F3546 — BankAccountVisibilityPage must use ParityTable (Search+Range+gear),
 * not a raw HTML table that skips the surface bar (when the hide flag is ON).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/banking/BankAccountVisibilityPage.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

/** Pure over the page text (defaults to the tracked file); the selftest passes a planted string. */
export function check(src = fs.readFileSync(path.join(ROOT, PAGE), "utf8")) {
  assert(src.includes("ParityTable"), "BankAccountVisibilityPage: must use ParityTable");
  assert(src.includes('storageKey="bank-account-visibility"'), "BankAccountVisibilityPage: must set storageKey");
  assert(src.includes('tableTestId="bank-account-visibility-table"'), "BankAccountVisibilityPage: must set tableTestId");
  assert(!/<table\b/.test(src), "BankAccountVisibilityPage: must not use raw HTML table");
  assert(src.includes("BANK_ACCOUNT_HIDE_FLAG_KEY"), "BankAccountVisibilityPage: keep feature-flag gate");
  assert(src.includes("hideBankAccount"), "BankAccountVisibilityPage: keep hide mutation");
}

function selftest() {
  check();
  const planted = [
    "export function BankAccountVisibilityPage() {",
    '  return <table className="min-w-full" data-testid="bank-account-visibility-table"><tbody /></table>;',
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
  console.log("verify-bank-account-visibility-parity-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) selftest();
else {
  check();
  console.log("verify-bank-account-visibility-parity-surface-bar PASS");
}
