#!/usr/bin/env node
/**
 * verify-acct-r14-sales-tax-autoload.mjs (ACCT-R-14 / audit4-tax-return-automation)
 *
 * Honesty lock: sales-tax routes must stay autoloaded via registerAccountingRoutes —
 * not orphaned as a dead file-only module.
 *
 * Asserts:
 *   1. sales-tax.routes.ts exists and default-exports a fastify-plugin wrapper.
 *   2. accounting/index.ts autoloads *.routes.ts|js under accounting/.
 *   3. apps/backend/src/index.ts calls registerAccountingRoutes(app).
 *
 * Usage:
 *   node scripts/verify-acct-r14-sales-tax-autoload.mjs
 *   node scripts/verify-acct-r14-sales-tax-autoload.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const LABEL = "verify-acct-r14-sales-tax-autoload";
const SALES_TAX_ROUTES = "apps/backend/src/accounting/sales-tax/sales-tax.routes.ts";
const ACCOUNTING_INDEX = "apps/backend/src/accounting/index.ts";
const BACKEND_INDEX = "apps/backend/src/index.ts";
const FE_PAGE = "apps/frontend/src/pages/accounting/SalesTaxPage.tsx";
const FE_SUBNAV = "apps/frontend/src/pages/accounting/subnav-manifest.ts";

function read(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return { text: null, error: `${rel}: missing` };
  return { text: fs.readFileSync(abs, "utf8"), error: null };
}

/** Pure checks for --selftest */
export function check({ salesTaxRoutes, accountingIndex, backendIndex, fePage, feSubnav }) {
  const failures = [];

  if (!salesTaxRoutes) {
    failures.push(`${SALES_TAX_ROUTES}: missing`);
  } else {
    if (!/export\s+default\s+fp/.test(salesTaxRoutes)) {
      failures.push(`${SALES_TAX_ROUTES}: must default-export fastify-plugin (fp) wrapper`);
    }
    if (!/registerSalesTaxRoutes/.test(salesTaxRoutes)) {
      failures.push(`${SALES_TAX_ROUTES}: must delegate to registerSalesTaxRoutes`);
    }
  }

  if (!accountingIndex) {
    failures.push(`${ACCOUNTING_INDEX}: missing`);
  } else {
    if (!/export\s+async\s+function\s+registerAccountingRoutes/.test(accountingIndex)) {
      failures.push(`${ACCOUNTING_INDEX}: must export registerAccountingRoutes`);
    }
    if (!/matchFilter:\s*\/\\\.routes\\\.\(ts\|js\)\$/.test(accountingIndex)) {
      failures.push(`${ACCOUNTING_INDEX}: autoload matchFilter must include \\.routes\\.`);
    }
  }

  if (!backendIndex) {
    failures.push(`${BACKEND_INDEX}: missing`);
  } else {
    if (!/registerAccountingRoutes/.test(backendIndex)) {
      failures.push(`${BACKEND_INDEX}: must import/call registerAccountingRoutes`);
    }
    if (!/await\s+registerAccountingRoutes\s*\(\s*app\s*\)/.test(backendIndex)) {
      failures.push(`${BACKEND_INDEX}: must await registerAccountingRoutes(app)`);
    }
  }

  if (!fePage) {
    failures.push(`${FE_PAGE}: missing`);
  } else if (!/prepareSalesTaxReturn|fileSalesTaxReturn|markSalesTaxReturnPaid/.test(fePage)) {
    failures.push(`${FE_PAGE}: must wire prepare/file/mark-paid actions`);
  }

  if (!feSubnav) {
    failures.push(`${FE_SUBNAV}: missing`);
  } else if (!/path:\s*"\/accounting\/sales-tax"/.test(feSubnav)) {
    failures.push(`${FE_SUBNAV}: must keep Sales tax leaf under Accounting`);
  }

  return failures;
}

function runScan() {
  const salesTax = read(SALES_TAX_ROUTES);
  const acctIdx = read(ACCOUNTING_INDEX);
  const backendIdx = read(BACKEND_INDEX);
  const fePage = read(FE_PAGE);
  const feSubnav = read(FE_SUBNAV);
  const failures = check({
    salesTaxRoutes: salesTax.error ? null : salesTax.text,
    accountingIndex: acctIdx.error ? null : acctIdx.text,
    backendIndex: backendIdx.error ? null : backendIdx.text,
    fePage: fePage.error ? null : fePage.text,
    feSubnav: feSubnav.error ? null : feSubnav.text,
  });
  if (salesTax.error) failures.unshift(salesTax.error);
  if (acctIdx.error) failures.unshift(acctIdx.error);
  if (backendIdx.error) failures.unshift(backendIdx.error);
  if (fePage.error) failures.unshift(fePage.error);
  if (feSubnav.error) failures.unshift(feSubnav.error);

  if (failures.length) {
    console.error(`FAIL(${LABEL}):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`PASS(${LABEL}): sales-tax.routes.ts autoload path wired`);
}

function runSelftest() {
  const goodSalesTax = `
import fp from "fastify-plugin";
export default fp(async (app) => { await registerSalesTaxRoutes(app); });
`;
  const goodAcctIndex = `
export async function registerAccountingRoutes(app) {
  await app.register(autoload, { matchFilter: /\\.routes\\.(ts|js)$/ });
}
`;
  const goodBackend = `
import { registerAccountingRoutes } from "./accounting/index.js";
await registerAccountingRoutes(app);
`;
  const goodFePage = `
prepareSalesTaxReturn(); fileSalesTaxReturn(); markSalesTaxReturnPaid();
`;
  const goodFeSubnav = `{ label: "Sales tax", path: "/accounting/sales-tax", section: "more" },`;

  const pass = check({
    salesTaxRoutes: goodSalesTax,
    accountingIndex: goodAcctIndex,
    backendIndex: goodBackend,
    fePage: goodFePage,
    feSubnav: goodFeSubnav,
  });
  if (pass.length) {
    console.error(`FAIL(${LABEL} --selftest): good fixture should pass`, pass);
    process.exit(1);
  }

  const fail = check({
    salesTaxRoutes: "export const x = 1;",
    accountingIndex: goodAcctIndex,
    backendIndex: goodBackend.replace("await registerAccountingRoutes(app)", "// removed"),
    fePage: goodFePage,
    feSubnav: goodFeSubnav,
  });
  if (!fail.length) {
    console.error(`FAIL(${LABEL} --selftest): bad fixture should fail`);
    process.exit(1);
  }

  console.log(`PASS(${LABEL} --selftest)`);
}

if (process.argv.includes("--selftest")) {
  runSelftest();
} else {
  runScan();
}
