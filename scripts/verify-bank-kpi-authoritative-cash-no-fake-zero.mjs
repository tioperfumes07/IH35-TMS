#!/usr/bin/env node
/**
 * BANK-KPI-FAKE-ZERO-CATCH-CLUSTER (cash-chain scope)
 *
 * GET /api/v1/banking/dashboard/kpis swallowed FIVE independent money/count sub-queries with
 * `.catch(() => <fake zero>)`, painting a healthy-looking dashboard over a real query failure. Worse,
 * the ROOT of the total_cash chain was doubly-masked: sumAuthoritativeDepositoryCashCents itself
 * (internal-wallet-balance.ts) already swallowed its own two internal queries — so the function could
 * never throw on a real DB error, and this exact total is shared by the KPI strip, /cash-flow opening
 * cash, and /accounts/all, so one masked failure corrupted three surfaces at once with a number that
 * reads as a real, alarming balance ($0 depository cash).
 *
 * This guard locks the CASH-CHAIN scope specifically (the board's own guard ask: "no bare
 * `.catch(() => 0)` / `.catch(() => ({ rows: [{ ... 0` survives on this handler's authoritative-cash
 * chain"):
 *  - internal-wallet-balance.ts's sumAuthoritativeDepositoryCashCents no longer catches either of its
 *    two internal queries into a fake-zero rows object.
 *  - banking.routes.ts's call to sumAuthoritativeDepositoryCashCents is no longer wrapped in
 *    `.catch(() => 0)`.
 *
 * Out of scope (left OPEN, not silently fixed here): the other 4 catches in the same KPI handler
 * (pendingBills, escrowCounts, uncategorizedCount fallback, totalTransactions) — lower-stakes COUNTS,
 * not the authoritative CASH total; a separate, narrower fix.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const WALLET_FILE = "apps/backend/src/banking/internal-wallet-balance.ts";
const ROUTES_FILE = "apps/backend/src/banking/banking.routes.ts";

export function check(walletSrc, routesSrc) {
  const failures = [];

  if (/\.catch\(\s*\(\)\s*=>\s*\(\{\s*rows:\s*\[\{\s*total_cash:\s*0\s*\}\]\s*\}\)\s*\)/.test(walletSrc)) {
    failures.push(`${WALLET_FILE}: the Plaid-depository query's fake-zero .catch() reappeared`);
  }
  if (/\.catch\(\s*\(\)\s*=>\s*\(\{\s*rows:\s*\[\{\s*internal_total:\s*0\s*\}\]\s*\}\)\s*\)/.test(walletSrc)) {
    failures.push(`${WALLET_FILE}: the internal-wallet-ledger query's fake-zero .catch() reappeared`);
  }
  if (!/export async function sumAuthoritativeDepositoryCashCents/.test(walletSrc)) {
    failures.push(`${WALLET_FILE}: sumAuthoritativeDepositoryCashCents export not found — guard out of sync`);
  }

  if (/sumAuthoritativeDepositoryCashCents\([^)]*\{[\s\S]*?\}\s*\)\s*\.catch\(\s*\(\)\s*=>\s*0\s*\)/.test(routesSrc)) {
    failures.push(`${ROUTES_FILE}: the KPI handler's .catch(() => 0) on sumAuthoritativeDepositoryCashCents reappeared`);
  }
  if (!/const authoritativeTotalCash = await sumAuthoritativeDepositoryCashCents/.test(routesSrc)) {
    failures.push(`${ROUTES_FILE}: authoritativeTotalCash call site not found — guard out of sync`);
  }

  return failures;
}

function readAll() {
  return {
    walletSrc: fs.readFileSync(path.join(root, WALLET_FILE), "utf8"),
    routesSrc: fs.readFileSync(path.join(root, ROUTES_FILE), "utf8"),
  };
}

function run() {
  const { walletSrc, routesSrc } = readAll();
  const failures = check(walletSrc, routesSrc);
  if (failures.length > 0) {
    console.error("FAIL: bank-kpi-authoritative-cash-no-fake-zero");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    "PASS: sumAuthoritativeDepositoryCashCents and its KPI-route caller no longer mask a real query " +
      "failure as $0 depository cash"
  );
}

function selftest() {
  const { walletSrc, routesSrc } = readAll();
  const baseline = check(walletSrc, routesSrc);
  if (baseline.length !== 0) {
    console.error("FAIL(selftest): baseline (current HEAD) is not clean:", baseline);
    process.exit(1);
  }

  // Mutation 1: reintroduce the plaidRes fake-zero catch (the exact pre-fix shape) by swapping the
  // closing `);` right after the plaidRes query's own [operatingCompanyId] bind-params array for the
  // old `).catch(...)`. This is the FIRST such occurrence in the file (plaidRes comes before
  // internalRes), so a plain single replace targets exactly the right call site.
  const offenderA = walletSrc.replace(
    "[operatingCompanyId]\n\n    );",
    "[operatingCompanyId]\n\n    ).catch(() => ({ rows: [{ total_cash: 0 }] }));"
  );
  if (offenderA === walletSrc) {
    console.error("FAIL(selftest): offender A mutation did not change the file — pattern out of sync");
    process.exit(1);
  }
  const failuresA = check(offenderA, routesSrc);
  if (failuresA.length === 0) {
    console.error("FAIL(selftest): planted offender (plaidRes fake-zero catch reintroduced) was NOT caught");
    process.exit(1);
  }

  // Mutation 2: reintroduce the KPI route's .catch(() => 0) on the authoritativeTotalCash call.
  const offenderB = routesSrc.replace(
    /const authoritativeTotalCash = await sumAuthoritativeDepositoryCashCents\(client, companyId, \{\n\s*hideFilterOnBankAccounts: bankAccountHiddenFilterSql\(hideOn, "banking\.bank_accounts"\),\n\s*hideFilterOnBaAlias: bankAccountHiddenFilterSql\(hideOn, "ba"\),\n\s*\}\);/,
    'const authoritativeTotalCash = await sumAuthoritativeDepositoryCashCents(client, companyId, {\n        hideFilterOnBankAccounts: bankAccountHiddenFilterSql(hideOn, "banking.bank_accounts"),\n        hideFilterOnBaAlias: bankAccountHiddenFilterSql(hideOn, "ba"),\n      }).catch(() => 0);'
  );
  if (offenderB === routesSrc) {
    console.error("FAIL(selftest): offender B mutation did not change the file — pattern out of sync");
    process.exit(1);
  }
  const failuresB = check(walletSrc, offenderB);
  if (failuresB.length === 0) {
    console.error("FAIL(selftest): planted offender (KPI route .catch(() => 0) reintroduced) was NOT caught");
    process.exit(1);
  }

  console.log("PASS(selftest): both planted regressions correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
