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

function assertRoutesLoaded(indexSource, legacyNeedle, message) {
  if (indexSource.includes(legacyNeedle)) return;
  if (indexSource.includes("app.register(autoload")) return;
  throw new Error(message);
}

try {
  const routesPath = "apps/backend/src/accounting/balance-sheet.routes.ts";
  const servicePath = "apps/backend/src/accounting/balance-sheet.service.ts";
  const indexPath = "apps/backend/src/accounting/index.ts";

  const routes = read(routesPath);
  const service = read(servicePath);
  const index = read(indexPath);

  assertIncludes(
    routes,
    'app.get("/api/v1/accounting/balance-sheet"',
    "Balance Sheet route is missing",
  );
  if (routes.includes('app.post("/api/v1/accounting/balance-sheet"')) {
    throw new Error("Balance Sheet route must be GET-only");
  }

  if (/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/i.test(service)) {
    throw new Error("Balance Sheet service must be SQL read-only (write SQL keyword found)");
  }

  assertMatches(
    service,
    /je\.status\s*<>\s*'voided'/,
    "Balance Sheet must exclude voided journal entries",
  );
  assertMatches(
    service,
    /p\.posting_batch_id IS NULL OR pb\.batch_status IN \('posted', 'reversed'\)/,
    "Balance Sheet must use reversal-safe posting batch filter",
  );
  assertIncludes(
    service,
    "const equityTotal = equityBaseTotal + currentYearEarnings;",
    "Equity total must include current-year-earnings",
  );
  assertIncludes(
    service,
    "const balanced = assetsTotal === totalLiabilitiesAndEquity;",
    "Balanced flag must derive from returned totals",
  );
  assertIncludes(
    service,
    "total_liabilities_and_equity: totalLiabilitiesAndEquity",
    "Response must expose derived liabilities+equity total",
  );
  assertIncludes(
    service,
    "current_year_earnings: currentYearEarnings",
    "Response must expose current-year-earnings",
  );

  assertRoutesLoaded(
    index,
    "registerBalanceSheetRoutes",
    "Balance Sheet routes are not registered in accounting index",
  );

  console.log("verify:balance-sheet-contract — OK");
} catch (error) {
  console.error(`verify:balance-sheet-contract — FAILED: ${error.message}`);
  process.exit(1);
}
