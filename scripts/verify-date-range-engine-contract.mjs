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
  const resolverPath = "apps/backend/src/accounting/date-range-engine.ts";
  const servicePath = "apps/backend/src/accounting/date-ranges.service.ts";
  const routePath = "apps/backend/src/accounting/date-ranges.routes.ts";
  const indexPath = "apps/backend/src/accounting/index.ts";

  const resolver = read(resolverPath);
  const service = read(servicePath);
  const route = read(routePath);
  const index = read(indexPath);

  assertIncludes(route, 'app.get("/api/v1/accounting/date-ranges"', "Date-ranges route is missing");
  if (route.includes('app.post("/api/v1/accounting/date-ranges"')) {
    throw new Error("Date-ranges route must be GET-only");
  }

  if (/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/i.test(service)) {
    throw new Error("Date-ranges service must be SQL read-only (write SQL keyword found)");
  }
  if (/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/i.test(resolver)) {
    throw new Error("Date-range resolver module must be pure/read-only");
  }

  assertIncludes(resolver, "RELATIVE_DATE_RANGE_KEYS", "Resolver must define relative named range keys");
  assertMatches(resolver, /"all_time"/, "Resolver must include all_time key");
  assertMatches(resolver, /from_date:\s*null/, "all_time must use null lower bound");

  assertIncludes(service, "WHERE id = $1::uuid", "Accounting-period resolution must be by id");
  assertIncludes(service, "operating_company_id = $2::uuid", "Accounting-period resolution must be company-scoped");

  assertIncludes(index, "registerDateRangesRoutes", "Date-ranges route must be registered");

  const statementRoutePaths = [
    "apps/backend/src/accounting/trial-balance.routes.ts",
    "apps/backend/src/accounting/profit-loss.routes.ts",
    "apps/backend/src/accounting/balance-sheet.routes.ts",
    "apps/backend/src/accounting/cash-flow.routes.ts",
    "apps/backend/src/accounting/ar-aging.routes.ts",
    "apps/backend/src/accounting/ap-aging.routes.ts",
  ];
  for (const path of statementRoutePaths) {
    const source = read(path);
    if (/\brange_key\b|\bperiod_id\b/.test(source)) {
      throw new Error(`Statement route appears modified for range-key wiring in this block: ${path}`);
    }
  }

  console.log("verify:date-range-engine-contract — OK");
} catch (error) {
  console.error(`verify:date-range-engine-contract — FAILED: ${error.message}`);
  process.exit(1);
}
