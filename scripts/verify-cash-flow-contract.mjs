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
  const routesPath = "apps/backend/src/accounting/cash-flow.routes.ts";
  const servicePath = "apps/backend/src/accounting/cash-flow.service.ts";
  const indexPath = "apps/backend/src/accounting/index.ts";

  const routes = read(routesPath);
  const service = read(servicePath);
  const index = read(indexPath);

  assertIncludes(
    routes,
    'app.get("/api/v1/accounting/cash-flow"',
    "Cash Flow route is missing",
  );
  if (routes.includes('app.post("/api/v1/accounting/cash-flow"')) {
    throw new Error("Cash Flow route must be GET-only");
  }

  if (/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/i.test(service)) {
    throw new Error("Cash Flow service must be SQL read-only (write SQL keyword found)");
  }

  assertMatches(
    service,
    /je\.status\s*<>\s*'voided'/,
    "Cash Flow must exclude voided journal entries",
  );
  assertMatches(
    service,
    /p\.posting_batch_id IS NULL OR pb\.batch_status IN \('posted', 'reversed'\)/,
    "Cash Flow must use reversal-safe posting batch filter",
  );

  assertIncludes(
    service,
    "const netCashChange = operatingTotal + investingTotal + financingTotal;",
    "net_cash_change must be derived from section totals",
  );
  assertIncludes(
    service,
    "const reconciled = netCashChange === cashAtEnd - cashAtStart;",
    "reconciled must be derived from returned figures",
  );

  assertRoutesLoaded(
    index,
    "registerCashFlowRoutes",
    "Cash Flow routes are not registered in accounting index",
  );

  console.log("verify:cash-flow-contract — OK");
} catch (error) {
  console.error(`verify:cash-flow-contract — FAILED: ${error.message}`);
  process.exit(1);
}
