#!/usr/bin/env node
/**
 * 443.170 — owner 2026-10-16: the Faro Cash Reserve / Faro Escrow Reserve / Faro Factoring screens in Banking "are not
 * rendering any of the data". Measured: banking.bank_accounts 1235 / 1230 / 1296 carry 0 bank-feed lines while 1230 holds
 * $891.38 of posted ledger activity (FP-2026-00009..00017). The Banking view only ever rendered bank-feed lines.
 *
 * Guards:
 *   1. BankingTransactionsDesignView decides "feed-less" from fullHistoryQuery (the account's COMPLETE line history).
 *   2. A feed-less account renders AccountRegisterPage embedded — the same component as Accounting → Account register
 *      (one function, one component; no second register implementation).
 *   3. AccountRegisterPage accepts embeddedBankAccountId and resolves it through the same deep-link path.
 *
 * --selftest: removes the embedded render and asserts the guard fails.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const VIEW = "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx";
const PAGE = "apps/frontend/src/pages/accounting/AccountRegisterPage.tsx";
const read = (rel) => readFileSync(resolve(ROOT, rel), "utf8");

function check(src = {}) {
  const view = src.view ?? read(VIEW);
  const page = src.page ?? read(PAGE);
  const findings = [];
  if (!/const feedlessAccountId\s*=[\s\S]{0,200}fullHistoryQuery\.isSuccess[\s\S]{0,120}\.length === 0/.test(view)) {
    findings.push(`${VIEW}: feed-less detection must read fullHistoryQuery (complete history), not a filtered page`);
  }
  if (!/<AccountRegisterPage embeddedBankAccountId=\{feedlessAccountId\}\s*\/>/.test(view)) {
    findings.push(`${VIEW}: a feed-less account does not render the shared AccountRegisterPage`);
  }
  if (!/import \{ AccountRegisterPage \} from "\.\.\/\.\.\/accounting\/AccountRegisterPage"/.test(view)) {
    findings.push(`${VIEW}: must import the one AccountRegisterPage (no second register implementation)`);
  }
  if (!/export function AccountRegisterPage\(\{ embeddedBankAccountId \}/.test(page)) {
    findings.push(`${PAGE}: AccountRegisterPage does not accept embeddedBankAccountId`);
  }
  if (!/const deepLinkAccountId = \(embeddedBankAccountId \?\?/.test(page)) {
    findings.push(`${PAGE}: embeddedBankAccountId is not resolved through the deep-link path`);
  }
  return findings;
}

if (process.argv.includes("--selftest")) {
  const view = read(VIEW);
  const mutated = view.replace(/<AccountRegisterPage embeddedBankAccountId=\{feedlessAccountId\}\s*\/>/, "<div />");
  if (mutated === view) {
    console.error("SELFTEST FAIL: could not remove the embedded register");
    process.exit(1);
  }
  const findings = check({ view: mutated });
  if (!findings.length) {
    console.error("SELFTEST FAIL: guard did not catch the missing embedded register");
    process.exit(1);
  }
  console.log(`SELFTEST PASS: caught ${findings.length} finding(s)`);
  process.exit(0);
}

const findings = check();
if (findings.length) {
  console.error(`verify-feedless-bank-account-shows-register FAIL (${findings.length}):`);
  for (const f of findings) console.error(`  ${f}`);
  process.exit(1);
}
console.log("verify-feedless-bank-account-shows-register PASS: a feed-less bank account opens on its ledger register");
