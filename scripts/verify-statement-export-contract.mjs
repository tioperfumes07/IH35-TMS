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
  const routesPath = "apps/backend/src/accounting/statement-export.routes.ts";
  const servicePath = "apps/backend/src/accounting/statement-export.service.ts";
  const indexPath = "apps/backend/src/accounting/index.ts";
  const packagePath = "package.json";

  const routes = read(routesPath);
  const service = read(servicePath);
  const index = read(indexPath);
  const pkg = read(packagePath);

  const routePaths = [
    "/api/v1/accounting/trial-balance/export/pdf",
    "/api/v1/accounting/trial-balance/export/xlsx",
    "/api/v1/accounting/profit-loss/export/pdf",
    "/api/v1/accounting/profit-loss/export/xlsx",
    "/api/v1/accounting/balance-sheet/export/pdf",
    "/api/v1/accounting/balance-sheet/export/xlsx",
    "/api/v1/accounting/cash-flow/export/pdf",
    "/api/v1/accounting/cash-flow/export/xlsx",
    "/api/v1/accounting/ar-aging/export/pdf",
    "/api/v1/accounting/ar-aging/export/xlsx",
    "/api/v1/accounting/ap-aging/export/pdf",
    "/api/v1/accounting/ap-aging/export/xlsx",
  ];

  for (const routePath of routePaths) {
    assertIncludes(routes, `app.get("${routePath}"`, `Missing GET export route: ${routePath}`);
    if (routes.includes(`app.post("${routePath}"`) || routes.includes(`app.patch("${routePath}"`) || routes.includes(`app.delete("${routePath}"`)) {
      throw new Error(`Export route must be GET-only: ${routePath}`);
    }
  }

  assertMatches(
    routes,
    /Content-Disposition", `attachment; filename="\$\{result\.filename\}"`/,
    "Export routes must stream attachment with filename",
  );

  if (/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/i.test(service)) {
    throw new Error("Statement export service must be SQL read-only (write SQL keyword found)");
  }

  const forbiddenDirectReads = [
    /FROM\s+accounting\.journal_entry_postings/i,
    /FROM\s+accounting\.journal_entries/i,
    /FROM\s+accounting\.invoices/i,
    /FROM\s+accounting\.bills/i,
  ];
  for (const pattern of forbiddenDirectReads) {
    if (pattern.test(service)) {
      throw new Error("Statement export service must not directly query ledger/invoice/bill tables");
    }
  }

  const requiredReportCalls = [
    "getTrialBalanceReport(",
    "getProfitLossReport(",
    "getBalanceSheetReport(",
    "getCashFlowReport(",
    "getArAgingReport(",
    "getApAgingReport(",
  ];
  for (const fnName of requiredReportCalls) {
    assertIncludes(service, fnName, `Statement export service missing report-service call: ${fnName}`);
  }

  assertRoutesLoaded(index, "registerStatementExportRoutes", "Statement export routes are not registered in accounting index");
  assertIncludes(pkg, '"verify:statement-export-contract"', "Missing verify:statement-export-contract npm script");
  assertIncludes(pkg, "npm run verify:statement-export-contract", "verify:arch-design must run statement export contract guard");

  console.log("verify:statement-export-contract — OK");
} catch (error) {
  console.error(`verify:statement-export-contract — FAILED: ${error.message}`);
  process.exit(1);
}
