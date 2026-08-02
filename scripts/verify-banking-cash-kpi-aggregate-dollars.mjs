#!/usr/bin/env node
/**
 * BANKING Layer E — Cash posting KPI must reconcile with per-account tile dollars.
 *
 * Root cause class: sumAuthoritativeDepositoryCashCents returns cents (shared with cash-flow
 * opening_cash_cents), but BankingHome money.format(total_cash) expects dollars. Assigning raw cents
 * made the aggregate 100× the per-account sum. Non-Plaid internal wallet tiles also stayed at $0 while
 * the aggregate included their ledger balance.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const BANKING_ROUTES = path.join(root, "apps/backend/src/banking/banking.routes.ts");
const HELPER = path.join(root, "apps/backend/src/banking/internal-wallet-balance.ts");
const BANKING_HOME = path.join(root, "apps/frontend/src/pages/banking/BankingHome.tsx");

function stripComments(src) {
  const blank = (m) => m.replace(/[^\n]/g, " ");
  return src.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/\/\/[^\n]*/g, blank);
}

function assertSources(routesSrc, helperSrc, homeSrc) {
  const errors = [];
  const routes = stripComments(routesSrc);
  const helper = stripComments(helperSrc);
  const home = stripComments(homeSrc);

  if (!/total_cash:\s*authoritativeTotalCash\s*\/\s*100/.test(routes)) {
    errors.push("banking.routes.ts: total_cash must be authoritativeTotalCash / 100 (dollars for UI, not cents)");
  }
  if (/total_cash:\s*authoritativeTotalCash\s*[,}\n]/.test(routes) && !/total_cash:\s*authoritativeTotalCash\s*\/\s*100/.test(routes)) {
    errors.push("banking.routes.ts: total_cash must not assign raw authoritativeTotalCash cents to the KPI payload");
  }
  if (!/withInternalWalletTileBalances\s*\(/.test(routes)) {
    errors.push("banking.routes.ts: GET /banking/account-tiles must call withInternalWalletTileBalances(...)");
  }
  if (!/export\s+async\s+function\s+withInternalWalletTileBalances/.test(helper)) {
    errors.push("internal-wallet-balance.ts: missing export withInternalWalletTileBalances");
  }
  if (!/current_balance:\s*cents\s*\/\s*100/.test(helper)) {
    errors.push("internal-wallet-balance.ts: tile override must convert ledger cents to dollars (/ 100)");
  }
  if (/const\s+cashPosting\s*=\s*Number\([^)]*total_cash[^)]*\)\s*\/\s*100/.test(home)) {
    errors.push("BankingHome.tsx: cashPosting must not divide total_cash by 100 — API already returns dollars");
  }

  return errors;
}

if (process.argv.includes("--selftest")) {
  const goodRoutes = `
    total_cash: authoritativeTotalCash / 100,
    return withInternalWalletTileBalances(client, companyId, res.rows);
  `;
  const badRoutes = `
    total_cash: authoritativeTotalCash,
    return res.rows;
  `;
  const goodHelper = `
    export async function withInternalWalletTileBalances() {}
    return { ...t, current_balance: cents / 100 };
  `;
  const goodHome = `const cashPosting = Number(kpiQuery.data?.total_cash ?? 0);`;
  const badHome = `const cashPosting = Number(kpiQuery.data?.total_cash ?? 0) / 100;`;
  if (assertSources(goodRoutes, goodHelper, goodHome).length !== 0) {
    console.error("SELFTEST FAIL: good fixtures flagged", assertSources(goodRoutes, goodHelper, goodHome));
    process.exit(1);
  }
  if (assertSources(badRoutes, goodHelper, goodHome).length === 0) {
    console.error("SELFTEST FAIL: bad routes not caught");
    process.exit(1);
  }
  if (assertSources(goodRoutes, goodHelper, badHome).length === 0) {
    console.error("SELFTEST FAIL: frontend double /100 not caught");
    process.exit(1);
  }
  console.log("verify-banking-cash-kpi-aggregate-dollars selftest OK");
  process.exit(0);
}

const errors = assertSources(
  fs.readFileSync(BANKING_ROUTES, "utf8"),
  fs.readFileSync(HELPER, "utf8"),
  fs.readFileSync(BANKING_HOME, "utf8")
);
if (errors.length) {
  console.error("FAIL verify-banking-cash-kpi-aggregate-dollars:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("PASS verify-banking-cash-kpi-aggregate-dollars — KPI total_cash is dollars; tiles derive internal wallets");
