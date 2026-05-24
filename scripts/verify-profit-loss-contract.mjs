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
  const routesPath = "apps/backend/src/accounting/profit-loss.routes.ts";
  const servicePath = "apps/backend/src/accounting/profit-loss.service.ts";
  const indexPath = "apps/backend/src/accounting/index.ts";

  const routes = read(routesPath);
  const service = read(servicePath);
  const index = read(indexPath);

  assertIncludes(
    routes,
    'app.get("/api/v1/accounting/profit-loss"',
    "Profit & Loss route is missing",
  );
  if (routes.includes('app.post("/api/v1/accounting/profit-loss"')) {
    throw new Error("Profit & Loss route must be GET-only");
  }

  if (/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/i.test(service)) {
    throw new Error("Profit & Loss service must be SQL read-only (write SQL keyword found)");
  }

  assertMatches(
    service,
    /je\.status\s*<>\s*'voided'/,
    "Profit & Loss must exclude voided journal entries",
  );
  assertMatches(
    service,
    /p\.posting_batch_id IS NULL OR pb\.batch_status IN \('posted', 'reversed'\)/,
    "Profit & Loss must use reversal-safe posting batch filter",
  );

  assertIncludes(
    service,
    "const grossProfit = revenueTotal - cogsTotal;",
    "Gross profit must be computed from section totals",
  );
  assertIncludes(
    service,
    "const netIncome = revenueTotal - cogsTotal - operatingExpensesTotal;",
    "Net income must be computed from section totals",
  );
  assertIncludes(
    service,
    "net_income: netIncome",
    "Response must expose computed net_income",
  );

  assertRoutesLoaded(
    index,
    "registerProfitLossRoutes",
    "Profit & Loss routes are not registered in accounting index",
  );

  console.log("verify:profit-loss-contract — OK");
} catch (error) {
  console.error(`verify:profit-loss-contract — FAILED: ${error.message}`);
  process.exit(1);
}
