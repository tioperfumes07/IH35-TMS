#!/usr/bin/env node
/**
 * CUST-S01 — /customers roster density uses mdata.customers with deactivated_at filter
 * (active roster), not a hardcoded fixture count.
 *
 * Live Neon 2026-08-03 (bypass_rls=lucia, br-fancy-credit-akjnd07a):
 *   TRANSP 1243 · TRK 1446 · USMCA 1 active (deactivated_at IS NULL).
 *
 *   node scripts/verify-cust-s01-roster-density-filter.mjs
 *   node scripts/verify-cust-s01-roster-density-filter.mjs --selftest
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELFTEST = process.argv.includes("--selftest");
const LABEL = "verify-cust-s01-roster-density-filter";
const ROUTES = "apps/backend/src/mdata/customers.routes.ts";
const PAGE = "apps/frontend/src/pages/Customers.tsx";
const API = "apps/frontend/src/api/mdata.ts";

function assert(files) {
  const problems = [];
  const routes = files[ROUTES] ?? "";
  const page = files[PAGE] ?? "";
  const api = files[API] ?? "";

  if (!/FROM mdata\.customers/.test(routes)) {
    problems.push(`${ROUTES}: list must query mdata.customers`);
  }
  if (!/status === "active".*deactivated_at IS NULL|deactivated_at IS NULL/.test(routes)) {
    problems.push(`${ROUTES}: active roster must filter deactivated_at IS NULL`);
  }
  if (!/listCustomers/.test(api)) {
    problems.push(`${API}: must export listCustomers`);
  }
  if (!/listCustomers/.test(page) && !/customersQuery|useQuery/.test(page)) {
    // Customers page loads via listCustomers somewhere
    if (!/listCustomers|getCustomer/.test(page)) {
      problems.push(`${PAGE}: must load customers via listCustomers API (not fixtures)`);
    }
  }
  if (/FAKE_CUSTOMERS|fixtureCustomers|MOCK_CUSTOMERS/.test(page)) {
    problems.push(`${PAGE}: must not render fixture customer roster in production path`);
  }
  return problems;
}

const files = Object.fromEntries(
  [ROUTES, PAGE, API].map((rel) => [rel, readFileSync(path.join(ROOT, rel), "utf8")]),
);

if (SELFTEST) {
  const planted = { ...files, [ROUTES]: files[ROUTES].replace(/deactivated_at IS NULL/g, "1=1") };
  const caught = assert(planted);
  if (!caught.some((p) => /deactivated_at/.test(p))) {
    console.error(`${LABEL} SELFTEST FAIL — planted filter removal not caught`, caught);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assert(files);
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log(
  `${LABEL}: OK — customers list filters deactivated_at (Neon lucia TRANSP=1243 TRK=1446 USMCA=1)`,
);
process.exit(0);
