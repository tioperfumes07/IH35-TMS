#!/usr/bin/env node
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function assertIncludes(source, needle, message) {
  if (!source.includes(needle)) throw new Error(message);
}

function assertMatches(source, regex, message) {
  if (!regex.test(source)) throw new Error(message);
}

try {
  const routePath = "apps/backend/src/accounting/trial-balance.routes.ts";
  const servicePath = "apps/backend/src/accounting/trial-balance.service.ts";
  const accountingIndexPath = "apps/backend/src/accounting/index.ts";

  const routes = read(routePath);
  const service = read(servicePath);
  const accountingIndex = read(accountingIndexPath);

  assertIncludes(
    routes,
    'app.get("/api/v1/accounting/trial-balance"',
    "Trial balance GET route is missing",
  );
  if (routes.includes('app.post("/api/v1/accounting/trial-balance"')) {
    throw new Error("Trial balance route must be read-only (POST found)");
  }
  assertIncludes(
    routes,
    "getTrialBalanceReport(",
    "Trial balance route must use service layer",
  );
  assertIncludes(
    accountingIndex,
    "registerTrialBalanceRoutes",
    "Trial balance routes are not registered in accounting index",
  );

  if (/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/i.test(service)) {
    throw new Error("Trial balance service must remain read-only (write SQL keyword found)");
  }

  assertMatches(
    service,
    /je\.status\s*<>\s*'voided'/,
    "Trial balance must explicitly exclude voided journal entries",
  );
  assertMatches(
    service,
    /p\.posting_batch_id IS NULL OR pb\.batch_status IN \('posted', 'reversed'\)/,
    "Trial balance must use reversal-safe posting batch filter",
  );

  assertIncludes(
    service,
    "const grandTotalDebits = rows.reduce((sum, row) => sum + row.total_debits, 0);",
    "Grand total debits must be derived from returned row totals",
  );
  assertIncludes(
    service,
    "const grandTotalCredits = rows.reduce((sum, row) => sum + row.total_credits, 0);",
    "Grand total credits must be derived from returned row totals",
  );
  assertIncludes(
    service,
    "balanced: grandTotalDebits === grandTotalCredits",
    "Balanced flag must be computed from returned grand totals",
  );

  console.log("verify:trial-balance-contract — OK");
} catch (error) {
  console.error(`verify:trial-balance-contract — FAILED: ${error.message}`);
  process.exit(1);
}
