#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = path.join(ROOT, "apps/frontend/src/routes/manifest.tsx");
const STUB_ROUTES = path.join(ROOT, "apps/backend/src/catalogs/stub-catalog-purge.routes.ts");

const REQUIRED_STUB_TABLES = [
  "audit_event_types",
  "cancellation_reasons",
  "complaint_types",
  "customer_quality_event_reasons",
  "dispatcher_error_reasons",
  "driver_leave_balances",
  "driver_termination_reasons",
  "labor_rates",
  "leave_policies",
  "maintenance_part_locations",
  "parts",
];

const MIN_DOMAIN_ROUTES = {
  fleet: 10,
  fuel: 12,
};

function fail(message) {
  console.error(`verify:no-stub-catalog-pages FAIL: ${message}`);
  process.exit(1);
}

function read(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) fail(`missing file ${rel}`);
  return fs.readFileSync(abs, "utf8");
}

const manifest = read("apps/frontend/src/routes/manifest.tsx");
const stubRoutes = read("apps/backend/src/catalogs/stub-catalog-purge.routes.ts");

const explicitListRoutes = [...manifest.matchAll(/path="(\/lists\/[^":]+)"/g)]
  .map((match) => match[1])
  .filter((routePath) => !routePath.includes(":"));

for (const routePath of explicitListRoutes) {
  const routeBlockPattern = new RegExp(
    `path="${routePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[\\s\\S]*?element=\\{[\\s\\S]*?\\}`,
    "m"
  );
  const block = manifest.match(routeBlockPattern)?.[0] ?? "";
  if (block.includes("ComingSoonPage")) {
    fail(`explicit lists route ${routePath} still renders ComingSoonPage`);
  }
}

for (const [domain, minimum] of Object.entries(MIN_DOMAIN_ROUTES)) {
  const count = explicitListRoutes.filter((routePath) => routePath.startsWith(`/lists/${domain}/`)).length;
  if (count < minimum) {
    fail(`${domain} manifest routes ${count} < required ${minimum}`);
  }
}

for (const tableName of REQUIRED_STUB_TABLES) {
  if (!new RegExp(`catalogs\\.${tableName}\\b`).test(stubRoutes)) {
    fail(`stub-catalog-purge.routes.ts missing catalogs.${tableName} registration`);
  }
  if (!new RegExp(`tableName:\\s*["']${tableName}["']`).test(stubRoutes) && !stubRoutes.includes(`"${tableName}"`)) {
    // tableName field optional when catalogs.{table} SQL reference exists
    if (!new RegExp(`catalogs\\.${tableName}\\b`).test(stubRoutes)) {
      fail(`stub-catalog-purge.routes.ts missing table reference for ${tableName}`);
    }
  }
}

if (!stubRoutes.includes("registerStubCatalogPurgeRoutes")) {
  fail("stub-catalog-purge.routes.ts must export registerStubCatalogPurgeRoutes");
}

console.log(
  `verify:no-stub-catalog-pages PASS (${explicitListRoutes.length} explicit /lists routes; fleet>=${MIN_DOMAIN_ROUTES.fleet}; fuel>=${MIN_DOMAIN_ROUTES.fuel}; ${REQUIRED_STUB_TABLES.length} stub tables wired)`
);
