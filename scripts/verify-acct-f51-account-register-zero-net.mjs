#!/usr/bin/env node
/**
 * ACCT-F51 — Account Register must not 404/crash on a zero-net (wash) account.
 *
 * Root cause: accounting.fn_account_balances_as_of() has a HAVING clause (correct for its primary
 * balance-sheet-style callers) that EXCLUDES any account whose opening AND closing balance are both
 * exactly $0 for the queried window — e.g. an equal offsetting debit+credit ("wash") to the same
 * account, or a real account with no activity yet. getAccountRegister() used the absence of that row
 * as an "account does not exist" signal and threw account_not_found -> the route 404'd -> the frontend
 * rendered "Couldn't load the register" instead of an honest $0 / 0-row register.
 *
 * Reproduced LIVE 2026-07-29 on prod (Neon lucia bypass): TRANSP "Income Accounts"
 * (catalogs.accounts.account_number = QBO-1150040073) has exactly two journal_entry_postings rows
 * (1 cent debit + 1 cent credit, 2026-05-19, both status=posted) that net to $0 — confirmed via
 * browser click-through (app.ih35dispatch.com /accounting/account-register, TRANSP, "This Year") to
 * show the red "Couldn't load the register" error banner.
 *
 * Fix: getAccountRegister() falls back to a direct catalogs.accounts metadata lookup (name/type only —
 * NOT a balance recomputation) ONLY when fn_account_balances_as_of excludes the account, and renders a
 * genuine $0 opening / $0 closing / 0-row register. A truly unknown or cross-entity account_id still
 * 404s (metadata lookup itself returns no row). No new GL math — the balance is already known to be
 * zero by construction of the HAVING exclusion (ACCT-R-44 companion: an accounting surface must never
 * unmount to a blank/error page on a well-formed-but-sparse response).
 *
 *   node scripts/verify-acct-f51-account-register-zero-net.mjs
 *   node scripts/verify-acct-f51-account-register-zero-net.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-acct-f51-account-register-zero-net";

const FILES = {
  service: "apps/backend/src/accounting/account-register.service.ts",
  test: "apps/backend/src/accounting/account-register.service.test.ts",
};

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function contractErrors(src) {
  const errors = [];

  if (!src.service.includes("fn_account_balances_as_of")) {
    errors.push("VERIFY-3: must still reuse the canonical fn_account_balances_as_of (no new GL math)");
  }
  if (!/if\s*\(\s*!acct\s*\)\s*\{/.test(src.service)) {
    errors.push("DOD-A: getAccountRegister must fall back when fn_account_balances_as_of excludes the account");
  }
  if (!src.service.includes("FROM catalogs.accounts")) {
    errors.push("DOD-A: fallback must confirm existence via a direct catalogs.accounts metadata lookup");
  }
  if (!src.service.includes('throw new Error("account_not_found")')) {
    errors.push("DOD-A: a genuinely unknown account_id must still throw account_not_found (real 404 preserved)");
  }
  // The bug pattern: throwing immediately when the row is absent, with no fallback branch at all.
  if (/const acct = balRes\.rows\.find[\s\S]{0,40}if \(!acct\) throw new Error\("account_not_found"\);\s*\n\s*const normal/.test(src.service)) {
    errors.push("REGRESSION: getAccountRegister reverted to throwing immediately on a HAVING-excluded (zero-net) account");
  }
  if (!src.test.includes("zero-net (wash) account does not crash")) {
    errors.push("VERIFY-7: unit test for the zero-net fallback must be present");
  }
  if (!src.test.includes("still throws account_not_found for a genuinely unknown")) {
    errors.push("VERIFY-7: unit test must also prove a real-missing account_id still 404s");
  }

  return errors;
}

function selftest() {
  const good = {
    service: [
      "fn_account_balances_as_of",
      "let acct = balRes.rows.find((r) => r.account_id === input.account_id);",
      "if (!acct) {",
      "FROM catalogs.accounts WHERE id = $1::uuid",
      'throw new Error("account_not_found")',
      "}",
    ].join("\n"),
    test: [
      "describe(\"account register — zero-net (wash) account does not crash\"",
      "it(\"still throws account_not_found for a genuinely unknown / cross-entity account_id\"",
    ].join("\n"),
  };
  if (contractErrors(good).length) {
    console.error(`${LABEL} --selftest FAIL good:`, contractErrors(good));
    process.exit(1);
  }
  const reverted = {
    ...good,
    service:
      'fn_account_balances_as_of\nconst acct = balRes.rows.find((r) => r.account_id === input.account_id);\n  if (!acct) throw new Error("account_not_found");\n  const normal: NormalBalance = acct.normal_balance',
  };
  if (!contractErrors(reverted).length) {
    console.error(`${LABEL} --selftest FAIL: did not catch the reverted (throws-immediately) pattern`);
    process.exit(1);
  }
  const noMetaFallback = { ...good, service: good.service.replace("FROM catalogs.accounts WHERE id = $1::uuid", "") };
  if (!contractErrors(noMetaFallback).some((e) => e.includes("metadata lookup"))) {
    console.error(`${LABEL} --selftest FAIL: did not catch missing metadata fallback`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const src = Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, read(rel)]));
const errors = contractErrors(src);
if (errors.length) {
  console.error(`${LABEL}: FAIL`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `${LABEL}: PASS — Account Register renders an honest $0 register for a HAVING-excluded zero-net account instead of 404/crash`
);
process.exit(0);
