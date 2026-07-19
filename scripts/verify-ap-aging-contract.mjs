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

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, "");
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

  const stripped = stripComments(service);
  // Full write-keyword fence on a financial reporting path — never narrow this. The most likely
  // accidental mutation here is `UPDATE accounting.bills SET paid_cents = …` ("healing" paid_cents
  // drift from a report), so UPDATE…SET must be caught alongside INSERT/DELETE/DDL/TRUNCATE/MERGE.
  if (/\bINSERT\s+INTO\b|\bUPDATE\b[\s\S]{0,120}?\bSET\b|\bDELETE\s+FROM\b|\bCREATE\s+TABLE\b|\bALTER\s+TABLE\b|\bDROP\s+TABLE\b|\bTRUNCATE\s+TABLE\b|\bMERGE\s+INTO\b/i.test(stripped)) {
    throw new Error("AP Aging service must be SQL read-only (write SQL keyword found)");
  }

  // Canonical as-of reconstruction (FIN-20 ap_aging_as_of semantics) + applied credits.
  assertMatches(service, /b\.amount_cents IS NOT NULL/, "AP Aging must exclude null amount_cents rows");
  assertMatches(service, /FROM accounting\.bill_payments bp/, "AP Aging must reconstruct paid_as_of from bill_payments");
  assertMatches(service, /bp\.payment_date <= \$2::date/, "AP Aging bill_payments must be as-of dated");
  assertMatches(service, /vendor_credit_applications/, "AP Aging must net vendor_credit_applications");
  assertMatches(service, /b\.revoked_at/, "AP Aging must exclude revoked bills (as-of aware)");
  assertMatches(
    service,
    /b\.status NOT IN \('voided', 'draft'\)/,
    "AP Aging must exclude voided/draft bills",
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
