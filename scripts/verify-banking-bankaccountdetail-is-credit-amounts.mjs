#!/usr/bin/env node
/**
 * verify-banking-bankaccountdetail-is-credit-amounts.mjs  (0441-mod8 guard)
 *
 * Root cause it locks: BankAccountDetail (archived Plaid txn table) rendered raw amount_cents via a local
 * money() helper with no is_credit handling, so deposits stored with Plaid-negative cents showed negative.
 *
 * Asserts:
 *   1. BankAccountDetail uses the shared is_credit-aware formatter (spentReceived + formatUsdCents).
 *   2. The archived txn table does NOT render unsigned raw amount_cents (money(Number(row.amount_cents))).
 *   3. No hand-rolled Intl.NumberFormat money() helper survives in this file (use lib/money).
 *
 * Self-test: node scripts/verify-banking-bankaccountdetail-is-credit-amounts.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const DETAIL_REL = "apps/frontend/src/pages/banking/BankAccountDetail.tsx";

const RAW_UNSIGNED_AMOUNT = /money\s*\(\s*Number\s*\(\s*row\.amount_cents\s*\)\s*\)/;
const HAND_ROLLED_MONEY_FN = /function\s+money\s*\(\s*cents\s*:\s*number\s*\)/;
const REQUIRED_FORMATTER = /formatBankTransactionSignedAmount\s*\(/;
const REQUIRED_IS_CREDIT_AWARE = /\bspentReceived\s*\(/;

/**
 * @param {string} detailSrc
 * @returns {string[]} failures
 */
export function evaluate(detailSrc) {
  const failures = [];

  if (HAND_ROLLED_MONEY_FN.test(detailSrc)) {
    failures.push(`${DETAIL_REL} — local money() helper must not hand-roll Intl.NumberFormat; use formatUsdCents from lib/money`);
  }
  if (RAW_UNSIGNED_AMOUNT.test(detailSrc)) {
    failures.push(`${DETAIL_REL} — archived txn table must not render raw amount_cents without is_credit (found money(Number(row.amount_cents)))`);
  }
  if (!REQUIRED_IS_CREDIT_AWARE.test(detailSrc)) {
    failures.push(`${DETAIL_REL} — must derive txn sign via spentReceived() (same convention as BankingTransactionsDesignView)`);
  }
  if (!REQUIRED_FORMATTER.test(detailSrc)) {
    failures.push(`${DETAIL_REL} — must format txn amounts via formatBankTransactionSignedAmount()`);
  }
  if (!detailSrc.includes("formatUsdCents")) {
    failures.push(`${DETAIL_REL} — must import formatUsdCents from lib/money for QBO-consistent display`);
  }

  return failures;
}

function readRepo(rel) {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

function runReal() {
  const detailSrc = readRepo(DETAIL_REL);
  const failures = evaluate(detailSrc);
  if (failures.length > 0) {
    console.error("[verify-banking-bankaccountdetail-is-credit-amounts] FAIL:");
    for (const message of failures) console.error(`  - ${message}`);
    process.exit(1);
  }
  console.log("[verify-banking-bankaccountdetail-is-credit-amounts] OK — BankAccountDetail txn amounts are is_credit-aware (spentReceived + formatUsdCents)");
}

function runSelftest() {
  const good = `
    import { formatUsdCents } from "../../lib/money";
    import { spentReceived } from "./components/BankingTransactionsDesignView";
    export function formatBankTransactionSignedAmount(tx) {
      const { spent, received } = spentReceived(tx);
      return received > 0 ? formatUsdCents(received) : formatUsdCents(-spent);
    }
    <td>{formatBankTransactionSignedAmount(row)}</td>
  `;
  const cases = [
    { name: "healthy: is_credit-aware formatter", src: good, expectPass: true },
    {
      name: "regression: raw unsigned amount_cents",
      src: good.replace("formatBankTransactionSignedAmount(row)", "money(Number(row.amount_cents))"),
      expectPass: false,
    },
    {
      name: "regression: hand-rolled money() helper",
      src: `${good}\nfunction money(cents: number) { return ""; }`,
      expectPass: false,
    },
    {
      name: "regression: missing spentReceived",
      src: good.replaceAll("spentReceived", "ignoredSpentReceived"),
      expectPass: false,
    },
  ];
  let ok = true;
  for (const c of cases) {
    const failures = evaluate(c.src);
    const passed = failures.length === 0;
    if (passed !== c.expectPass) {
      ok = false;
      console.error(`  SELFTEST FAIL — ${c.name}: expected ${c.expectPass ? "pass" : "fail"}, got ${passed ? "pass" : "fail"}`);
    } else {
      console.log(`  selftest ok — ${c.name}`);
    }
  }
  if (!ok) process.exit(1);
  console.log("[verify-banking-bankaccountdetail-is-credit-amounts] --selftest OK");
}

if (process.argv.includes("--selftest")) {
  runSelftest();
} else {
  runReal();
}
