#!/usr/bin/env node
/**
 * ACCT-SURF-07 — Account Register + All Transactions deep structural DoD.
 *
 * Frozen surface map: docs/trackers/ACCT-08-SURF-SURFACE-MAP-2026-07-25.md
 * Desktop Expected vs Actual: ~/Desktop/IH35-CURSOR-AUDIT/modules/accounting-surf-dod-2026-07-25.md
 *
 * Asserts:
 *  - DOD-A: /accounting/account-register → AccountRegisterPage;
 *           /accounting/transactions → TransactionRegisterPage; no ComingSoon twins
 *  - NEVER-DELETE: both leaves in subnav-manifest
 *  - VERIFY-3: getAccountRegister + listTransactionRegister API wiring
 *  - VERIFY-4: reverse drill — sourceRoute maps money types to detail paths;
 *              TransactionRegisterPage navigates detail_path; EntityLink on JE audit tab
 *
 * Does NOT flip scoreboard PASS — live browser TRANSP+USMCA + Neon reverse density remain UNVERIFIED.
 *
 *   node scripts/verify-acct-surf-07-register.mjs
 *   node scripts/verify-acct-surf-07-register.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-acct-surf-07-register";

const ROUTES = [
  { path: "/accounting/account-register", component: "AccountRegisterPage", leaf: "Account Register" },
  { path: "/accounting/transactions", component: "TransactionRegisterPage", leaf: "All Transactions" },
];

const FILES = {
  map: "docs/trackers/ACCT-08-SURF-SURFACE-MAP-2026-07-25.md",
  manifest: "apps/frontend/src/routes/manifest.tsx",
  subnav: "apps/frontend/src/pages/accounting/subnav-manifest.ts",
  accountRegister: "apps/frontend/src/pages/accounting/AccountRegisterPage.tsx",
  txnRegister: "apps/frontend/src/pages/accounting/TransactionRegisterPage.tsx",
  accountRegisterApi: "apps/frontend/src/api/account-register.ts",
  accountingApi: "apps/frontend/src/api/accounting.ts",
  accountRegisterRoutes: "apps/backend/src/accounting/account-register.routes.ts",
  accountRegisterService: "apps/backend/src/accounting/account-register.service.ts",
  txnRegisterRoutes: "apps/backend/src/accounting/transaction-register.routes.ts",
};

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function routeBlock(manifest, routePath) {
  const escaped = routePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`path=["']${escaped}["'][\\s\\S]{0,500}?(?=path=["']|$)`);
  const m = manifest.match(re);
  return m ? m[0] : "";
}

function contractErrors(src) {
  const errors = [];

  if (!src.map.includes("ACCT-SURF-07") || !src.map.includes("/accounting/account-register")) {
    errors.push("frozen map missing ACCT-SURF-07 → /accounting/account-register");
  }
  if (!src.map.includes("/accounting/transactions")) {
    errors.push("frozen map missing ACCT-SURF-07 → /accounting/transactions");
  }

  for (const r of ROUTES) {
    const block = routeBlock(src.manifest, r.path);
    if (!block) {
      errors.push(`DOD-A: missing route ${r.path}`);
      continue;
    }
    if (/ComingSoonPage/.test(block)) {
      errors.push(`DOD-A: ${r.path} must not mount ComingSoonPage`);
    }
    if (!block.includes(`<${r.component}`)) {
      errors.push(`DOD-A: ${r.path} must render <${r.component} />`);
    }
    if (!src.subnav.includes(r.path)) {
      errors.push(`NEVER-DELETE: ${r.leaf} leaf ${r.path} missing from subnav-manifest`);
    }
  }

  // Account Register page structural reverse drill
  if (!src.accountRegister.includes("function sourceRoute")) {
    errors.push("VERIFY-4: AccountRegisterPage must define sourceRoute for reverse drill");
  }
  for (const [type, needle] of [
    ["invoice", "/accounting/invoices/${reference}"],
    ["bill", "/accounting/bills/${reference}"],
    ["bill_payment", "/accounting/bill-payments/${reference}"],
    ["expense", "/accounting/expenses/${reference}"],
    ["customer_payment", "/accounting/payments/${reference}"],
    ["bank_categorization", "/banking/transactions?txn_id=${reference}"],
    ["settlement", "settlement_id=${reference}"],
    ["transfer", "/banking/transfers"],
  ]) {
    if (!src.accountRegister.includes(needle)) {
      errors.push(`VERIFY-4: sourceRoute must deep-link ${type} → money doc (${needle})`);
    }
  }
  if (!src.accountRegister.includes("onRowClick") || !src.accountRegister.includes("sourceRoute")) {
    errors.push("VERIFY-4: AccountRegisterPage ParityTable onRowClick must call sourceRoute");
  }
  if (!src.accountRegister.includes('EntityLink kind="journal_entry"')) {
    errors.push("VERIFY-4: AccountRegisterPage audit tab must EntityLink journal_entry rows");
  }
  if (!src.accountRegister.includes("getAccountRegister")) {
    errors.push("VERIFY-3: AccountRegisterPage must call getAccountRegister");
  }
  if (!src.accountRegister.includes("AccountingSubNavWrapper")) {
    errors.push("DOD-A: AccountRegisterPage must use AccountingSubNavWrapper");
  }

  // All Transactions page structural reverse drill
  if (!src.txnRegister.includes("listTransactionRegister")) {
    errors.push("VERIFY-3: TransactionRegisterPage must call listTransactionRegister");
  }
  if (!src.txnRegister.includes("detail_path")) {
    errors.push("VERIFY-4: TransactionRegisterPage must expose detail_path Open link");
  }
  if (!src.txnRegister.includes("navigate(r.detail_path")) {
    errors.push("VERIFY-4: TransactionRegisterPage Open button must navigate detail_path");
  }
  if (!src.txnRegister.includes("AccountingSubNavWrapper")) {
    errors.push("DOD-A: TransactionRegisterPage must use AccountingSubNavWrapper");
  }

  if (!src.accountRegisterApi.includes("/api/v1/accounting/account-register")) {
    errors.push("VERIFY-3: getAccountRegister must GET /api/v1/accounting/account-register");
  }
  if (
    !src.accountingApi.includes("listTransactionRegister") ||
    !src.accountingApi.includes("/api/v1/accounting/transaction-register")
  ) {
    errors.push("VERIFY-3: listTransactionRegister must GET /api/v1/accounting/transaction-register");
  }

  if (!src.accountRegisterRoutes.includes("/api/v1/accounting/account-register")) {
    errors.push("VERIFY-3: account-register.routes must mount GET /api/v1/accounting/account-register");
  }
  if (!src.accountRegisterService.includes("accounting.journal_entry_postings")) {
    errors.push("VERIFY-3: account-register.service must read canonical accounting.journal_entry_postings");
  }
  if (/FROM\s+bank\.|FROM\s+payroll\./i.test(src.accountRegisterService)) {
    errors.push("VERIFY-3: account-register.service must not read RETIRE schemas");
  }

  if (!src.txnRegisterRoutes.includes("/api/v1/accounting/transaction-register")) {
    errors.push("VERIFY-3: transaction-register.routes must mount GET /api/v1/accounting/transaction-register");
  }
  if (!src.txnRegisterRoutes.includes("detail_path")) {
    errors.push("VERIFY-4: transaction-register.routes must emit id-scoped detail_path");
  }
  if (src.txnRegisterRoutes.includes("'/accounting/bills' AS detail_path")) {
    errors.push("VERIFY-4: bill arm must not emit list-only /accounting/bills detail_path");
  }

  return errors;
}

function selftest() {
  const good = {
    map: "ACCT-SURF-07 /accounting/account-register /accounting/transactions",
    manifest: [
      'path="/accounting/account-register"\n<AccountRegisterPage />\n',
      'path="/accounting/transactions"\n<TransactionRegisterPage />\n',
    ].join("\n"),
    subnav: "/accounting/account-register\n/accounting/transactions\nAccount Register\nAll Transactions",
    accountRegister: [
      "function sourceRoute",
      "`/accounting/invoices/${reference}`",
      "`/accounting/bills/${reference}`",
      "`/accounting/bill-payments/${reference}`",
      "`/accounting/expenses/${reference}`",
      "`/accounting/payments/${reference}`",
      "`/banking/transactions?txn_id=${reference}`",
      "settlement_id=${reference}",
      'if (t === "transfer") return "/banking/transfers"',
      "onRowClick={(r) => navigate(sourceRoute",
      'EntityLink kind="journal_entry"',
      "getAccountRegister",
      "AccountingSubNavWrapper",
    ].join("\n"),
    txnRegister: [
      "listTransactionRegister",
      "detail_path",
      "navigate(r.detail_path",
      "AccountingSubNavWrapper",
    ].join("\n"),
    accountRegisterApi: "/api/v1/accounting/account-register",
    accountingApi: "listTransactionRegister /api/v1/accounting/transaction-register",
    accountRegisterRoutes: "/api/v1/accounting/account-register",
    accountRegisterService: "accounting.journal_entry_postings",
    txnRegisterRoutes: [
      "/api/v1/accounting/transaction-register",
      "detail_path",
      "'/accounting/bills/' || b.id::text AS detail_path",
    ].join("\n"),
  };
  if (contractErrors(good).length) {
    console.error(`${LABEL} --selftest FAIL good:`, contractErrors(good));
    process.exit(1);
  }
  const twin = {
    ...good,
    manifest: 'path="/accounting/account-register"\n<ComingSoonPage />\n' + good.manifest,
  };
  if (!contractErrors(twin).some((e) => e.includes("ComingSoon"))) {
    console.error(`${LABEL} --selftest FAIL ComingSoon twin not caught`);
    process.exit(1);
  }
  const deadEnd = {
    ...good,
    txnRegisterRoutes: "'/accounting/bills' AS detail_path\n/api/v1/accounting/transaction-register\ndetail_path",
  };
  if (!contractErrors(deadEnd).some((e) => e.includes("list-only"))) {
    console.error(`${LABEL} --selftest FAIL list-only bill detail_path not caught`);
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
  `${LABEL}: PASS — ACCT-SURF-07 Account Register + All Transactions structural DoD (routes+subnav+reverse drill); live browser still UNVERIFIED`
);
process.exit(0);
