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
  const routesPath = "apps/backend/src/accounting/ap-aging.routes.ts";
  const servicePath = "apps/backend/src/accounting/ap-aging.service.ts";
  const indexPath = "apps/backend/src/accounting/index.ts";

  const routes = read(routesPath);
  const service = read(servicePath);
  const index = read(indexPath);

  assertIncludes(routes, 'app.get("/api/v1/accounting/ap-aging"', "AP Aging route is missing");
  if (routes.includes('app.post("/api/v1/accounting/ap-aging"')) {
    throw new Error("AP Aging route must be GET-only");
  }

  if (/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/i.test(service)) {
    throw new Error("AP Aging service must be SQL read-only (write SQL keyword found)");
  }

  assertMatches(service, /b\.amount_cents IS NOT NULL/, "AP Aging must exclude null amount_cents rows");
  assertMatches(service, /\(b\.amount_cents - b\.paid_cents\) > 0/, "AP Aging must enforce positive derived outstanding");
  assertMatches(service, /b\.revoked_at IS NULL/, "AP Aging must exclude revoked bills");
  assertMatches(
    service,
    /b\.status NOT IN \('paid', 'voided', 'draft'\)/,
    "AP Aging must include status safety-net exclusion for paid/voided/draft",
  );

  assertIncludes(
    service,
    "vendor.total_outstanding = vendor.current + vendor.d1_30 + vendor.d31_60 + vendor.d61_90 + vendor.d90_plus;",
    "Per-vendor total_outstanding must be derived from bucket amounts",
  );
  assertIncludes(
    service,
    "acc.total_outstanding += row.total_outstanding;",
    "Grand total_outstanding must be derived from report vendor rows",
  );

  assertRoutesLoaded(index, "registerApAgingRoutes", "AP Aging routes are not registered in accounting index");

  console.log("verify:ap-aging-contract — OK");
} catch (error) {
  console.error(`verify:ap-aging-contract — FAILED: ${error.message}`);
  process.exit(1);
}
