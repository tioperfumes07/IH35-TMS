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
  const routesPath = "apps/backend/src/accounting/ar-aging.routes.ts";
  const servicePath = "apps/backend/src/accounting/ar-aging.service.ts";
  const indexPath = "apps/backend/src/accounting/index.ts";

  const routes = read(routesPath);
  const service = read(servicePath);
  const index = read(indexPath);

  assertIncludes(routes, 'app.get("/api/v1/accounting/ar-aging"', "AR Aging route is missing");
  if (routes.includes('app.post("/api/v1/accounting/ar-aging"')) {
    throw new Error("AR Aging route must be GET-only");
  }

  if (/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/i.test(service)) {
    throw new Error("AR Aging service must be SQL read-only (write SQL keyword found)");
  }

  assertMatches(service, /i\.amount_open_cents IS NOT NULL/, "AR Aging must exclude null outstanding balances");
  assertMatches(service, /i\.amount_open_cents > 0/, "AR Aging must enforce positive outstanding balances");
  assertMatches(service, /i\.voided_at IS NULL/, "AR Aging must exclude voided invoices");
  assertMatches(
    service,
    /i\.status NOT IN \('paid', 'voided', 'draft'\)/,
    "AR Aging must include status safety-net exclusion for paid/voided/draft",
  );

  assertIncludes(
    service,
    "customer.total_outstanding =",
    "Per-customer total_outstanding must be derived from bucket amounts",
  );
  assertIncludes(
    service,
    "acc.total_outstanding += row.total_outstanding;",
    "Grand total_outstanding must be derived from report customer rows",
  );

  assertIncludes(index, "registerArAgingRoutes", "AR Aging routes are not registered in accounting index");

  console.log("verify:ar-aging-contract — OK");
} catch (error) {
  console.error(`verify:ar-aging-contract — FAILED: ${error.message}`);
  process.exit(1);
}
