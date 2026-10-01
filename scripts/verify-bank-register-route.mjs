#!/usr/bin/env node
/**
 * ROUND 312 B-1 — QBO-style Bank Register at /banking/register/:accountId.
 * Keep feed review (/banking/transactions); both linked from Banking subnav.
 * Register reads journal_entry_postings via account-register.service (not the bank feed).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bank-register-route";

const FILES = {
  nav: "apps/frontend/src/pages/banking/BANKING_NAV_CONFIG.ts",
  routes: "apps/frontend/src/router/route-manifest.ts",
  manifest: "apps/frontend/src/routes/manifest.tsx",
  service: "apps/backend/src/accounting/account-register.service.ts",
  page: "apps/frontend/src/pages/accounting/AccountRegisterPage.tsx",
};

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function assertBankRegisterRoute(srcs) {
  const fails = [];
  if (!/id: \"register\"/.test(srcs.nav) || !/"register"/.test(srcs.nav)) {
    fails.push("BANKING_MODULE_TABS / SUBNAV must include register");
  }
  if (!/register: \"\/banking\/register\"/.test(srcs.routes)) {
    fails.push("BANKING_TAB_PATH.register must be /banking/register");
  }
  if (!/pathname\.startsWith\(\"\/banking\/register\"\)/.test(srcs.routes)) {
    fails.push("bankingTabFromPath must recognize /banking/register");
  }
  if (!/path=\"\/banking\/register\/:accountId\"/.test(srcs.manifest)) {
    fails.push("manifest must mount /banking/register/:accountId");
  }
  if (!/path=\"\/banking\/register\"/.test(srcs.manifest)) {
    fails.push("manifest must mount /banking/register");
  }
  if (!/AccountRegisterPage/.test(srcs.manifest)) {
    fails.push("banking register routes must render AccountRegisterPage");
  }
  if (!/path=\"\/banking\/transactions\"/.test(srcs.manifest)) {
    fails.push("feed review /banking/transactions must remain mounted");
  }
  if (!/journal_entry_postings/.test(srcs.service) && !/fn_account_balances_as_of/.test(srcs.service)) {
    fails.push("account-register.service must read JE postings / balances (not bank feed)");
  }
  if (!/reconcile_status/.test(srcs.service)) {
    fails.push("register must expose reconcile_status (blank/C/R)");
  }
  if (!/sourceRoute|source_transaction/.test(srcs.page)) {
    fails.push("AccountRegisterPage must drill to source document");
  }
  return fails;
}

const srcs = Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, read(rel)]));

if (process.argv.includes("--selftest")) {
  if (assertBankRegisterRoute(srcs).length) {
    console.error(`${LABEL} SELFTEST FAIL — current sources should pass`);
    for (const f of assertBankRegisterRoute(srcs)) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  const bad = { ...srcs, nav: srcs.nav.replace(/id: \"register\"/g, 'id: "nope"') };
  if (!assertBankRegisterRoute(bad).length) {
    console.error(`${LABEL} SELFTEST FAIL — planted missing register tab should fail`);
    process.exit(1);
  }
  console.log(`${LABEL} selftest PASS`);
  process.exit(0);
}

const fails = assertBankRegisterRoute(srcs);
if (fails.length) {
  console.error(`${LABEL} FAIL`);
  for (const f of fails) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
