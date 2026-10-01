#!/usr/bin/env node
/**
 * ORDERS 2026-10-01 CUSTOMERS complete — locations geocode badges, AR read-only,
 * Faro factoring status, complaints, credit/insurance surfaces.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LABEL = "verify-customers-orders-complete";

const DETAIL = "apps/frontend/src/pages/CustomerDetail.tsx";
const LOCS = "apps/frontend/src/components/customers/CustomerLocationsSection.tsx";
const BADGE = "apps/frontend/src/components/customers/GeocodePrecisionBadge.tsx";
const ROUTES = "apps/backend/src/mdata/customers.routes.ts";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertIncludes(src, needle, where) {
  if (!src.includes(needle)) throw new Error(`${where}: missing ${JSON.stringify(needle)}`);
}

function main() {
  const detail = read(DETAIL);
  const locs = read(LOCS);
  const badge = read(BADGE);
  const routes = read(ROUTES);

  assertIncludes(routes, "/api/v1/mdata/customers/:id/locations", ROUTES);
  assertIncludes(routes, "geocode_precision", ROUTES);
  assertIncludes(routes, "stop_locations", ROUTES);
  assertIncludes(routes, "linked_locations", ROUTES);
  assertIncludes(routes, "'locality'", ROUTES);

  assertIncludes(badge, "locality — not a stop", BADGE);
  assertIncludes(badge, 'data-geocode-precision="locality"', BADGE);
  assertIncludes(badge, "rooftop", BADGE);
  assertIncludes(badge, "approximate", BADGE);

  assertIncludes(locs, 'data-cust-locations="1"', LOCS);
  assertIncludes(locs, "/mdata/customers/", LOCS);
  assertIncludes(locs, "GeocodePrecisionBadgeChip", LOCS);

  assertIncludes(detail, "CustomerLocationsSection", DETAIL);
  assertIncludes(detail, 'data-cust-ar-readonly="1"', DETAIL);
  assertIncludes(detail, "Invoices and A/R on this customer profile are read only", DETAIL);
  assertIncludes(detail, 'data-testid="customer-record-payment-disabled"', DETAIL);
  assertIncludes(detail, 'data-cust-faro="1"', DETAIL);
  assertIncludes(detail, "ComplaintsReverseSection", DETAIL);
  assertIncludes(detail, "Credit Limit", DETAIL);
  assertIncludes(detail, "CoiRequestsTab", DETAIL);
  assertIncludes(detail, "DocumentsTab", DETAIL);
  assertIncludes(detail, '"Loads"', DETAIL);
  if (/Record payment/.test(detail) && /recordCustomerPaymentMutation\.mutateAsync/.test(detail)) {
    throw new Error(`${DETAIL}: Record payment write must stay off customer profile`);
  }

  console.log(`${LABEL}: PASS`);
}

function selftest() {
  try {
    main();
  } catch (err) {
    console.error(`${LABEL}: SELFTEST FAIL — ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
  console.log(`${LABEL}: SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) selftest();
else main();
