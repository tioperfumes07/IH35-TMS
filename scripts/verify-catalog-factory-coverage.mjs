#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = path.join(ROOT, "db/migrations");
const CATALOGS_DIR = path.join(ROOT, "apps/backend/src/catalogs");
const GENERIC_ROUTES = path.join(CATALOGS_DIR, "generic-catalog.routes.ts");
const GENERIC_FACTORY = path.join(CATALOGS_DIR, "generic-catalog.factory.ts");
const EXCEL_UPLOADER = path.join(CATALOGS_DIR, "excel-uploader.ts");
const MIGRATION_FILE = path.join(ROOT, "db/migrations/0383_catalog_excel_upload_jobs.sql");

const EXCLUDED_TABLE_SUFFIXES = [
  "_dedup_ledger",
  "_line_item_templates",
  "_templates",
  "excel_upload_jobs",
  "form_425c_company_profiles",
];

/** Grandfathered catalog tables that exist in schema but are not yet on the generic factory. */
// void_cancel_reasons was grandfathered here until Task #24 Block 09; Block 09 ships its DEDICATED
// CRUD route + Lists profile (specialized per-entity RLS + requires-note/same-entity DB trigger the
// generic factory can't model), so it is now registered and removed from this stub list.
// BLOCK-17/24 tax-document engine ships two specialized catalogs.* tables that are NOT generic
// Excel-upload CRUD catalogs — they are managed by the dedicated tax-documents module: payee_tax_profile
// (per-payee W-9/W-8BEN tax status driving 1099-NEC vs 1042-S selection, effective-year-keyed, voidable)
// and tax_form_thresholds (year-keyed IRS reporting thresholds read by box1-aggregation). Neither fits the
// generic factory model (no free-form Excel upload; specialized effective-dated/tax-year semantics), so
// they are grandfathered here rather than force-fit onto the generic catalog factory.
// vendor_types (202607420000_vendor_types_catalog) is a per-entity, QBO-mirrorable catalog built on the
// AF-1/AF-2/AF-3 pattern (catalogs.accounts / items / classes), NOT the generic Excel-upload CRUD model:
// it carries qbo_vendor_type_id mirror + is_system-seeded rows + vendor_type_name/vendor_type_code columns
// (no code/display_name/sort_order the generic factory requires). Its DEDICATED per-entity CRUD route +
// QBO-mirror reconcile (mirroring accounts/items/classes .routes.ts) is follow-on block work; until that
// ships it is grandfathered here — same treatment void_cancel_reasons had before its dedicated route landed.
// account_merge_records (202608060000 ACCT-R-03) is an append-only merge audit ledger written exclusively
// by POST /api/v1/catalogs/accounts/:id/merge — not a Lists/Excel generic CRUD catalog (no upload/export,
// REVOKE UPDATE/DELETE). Grandfathered until a read-only audit route is spec'd; factory registration would
// falsely imply editable catalog chrome.
// vendor_types REMOVED from this list by LST-WIRE-04: it is no longer a stub. It now has a factory
// config, a frontend registry entry, a Lists hub tile and an inline "+ Add new vendor type" creator,
// after an additive migration gave it the canonical code/display_name/sort_order shape. It was
// grandfathered here while the vendor-type picker was a frozen TypeScript union and the catalog — 8
// rows per entity, FORCE RLS — was read by nothing.
const KNOWN_STUB_TABLES = ["account_merge_records", "payee_tax_profile", "tax_form_thresholds"];

function fail(message) {
  console.error(`verify:catalog-factory-coverage FAIL: ${message}`);
  process.exit(1);
}

function pass(message) {
  console.log(`verify:catalog-factory-coverage PASS${message ? ` (${message})` : ""}`);
}

function walkFiles(dir, matcher, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, matcher, acc);
      continue;
    }
    if (matcher(full)) acc.push(full);
  }
  return acc;
}

function extractCatalogTablesFromMigrations() {
  const tables = new Set();
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  const createTablePattern = /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+catalogs\.([a-z_][a-z0-9_]*)/gi;

  for (const file of files) {
    const source = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    let match = createTablePattern.exec(source);
    while (match) {
      tables.add(match[1]);
      match = createTablePattern.exec(source);
    }
    createTablePattern.lastIndex = 0;
  }

  return [...tables].filter((table) => !EXCLUDED_TABLE_SUFFIXES.some((suffix) => table.endsWith(suffix) || table.includes(suffix)));
}

function collectRouteSources() {
  return walkFiles(
    CATALOGS_DIR,
    (filePath) => /(?:\.routes|-routes)\.ts$/.test(filePath) && !filePath.endsWith(".test.ts")
  );
}

function collectFactorySources() {
  return walkFiles(
    CATALOGS_DIR,
    (filePath) => filePath.endsWith("/factory.ts") || filePath.endsWith("/index.ts") || filePath.endsWith("generic-catalog.factory.ts")
  );
}

function hasTableRegistration(source, tableName) {
  return (
    new RegExp(`tableName:\\s*["']${tableName}["']`).test(source) ||
    new RegExp(`catalogName:\\s*["'][^"']*\\.${tableName}["']`).test(source) ||
    new RegExp(`catalogs\\.${tableName}\\b`).test(source)
  );
}

for (const required of [GENERIC_ROUTES, GENERIC_FACTORY, EXCEL_UPLOADER, MIGRATION_FILE]) {
  if (!fs.existsSync(required)) {
    fail(`missing required file ${path.relative(ROOT, required)}`);
  }
}

const genericRoutesSource = fs.readFileSync(GENERIC_ROUTES, "utf8");
const genericFactorySource = fs.readFileSync(GENERIC_FACTORY, "utf8");
const migrationSource = fs.readFileSync(MIGRATION_FILE, "utf8");

if (!genericFactorySource.includes("createCatalogRoutes")) fail("generic-catalog.factory must export createCatalogRoutes");
if (!genericFactorySource.includes("export.csv")) fail("generic factory must expose export.csv route");
if (!genericFactorySource.includes("/import")) fail("generic factory must expose import route");
if (!genericRoutesSource.includes("fleet.equipment_types")) fail("generic routes must wire fleet.equipment_types example catalog");
if (!migrationSource.includes("catalogs.excel_upload_jobs")) fail("migration must create catalogs.excel_upload_jobs");

const routeSources = collectRouteSources().map((filePath) => ({
  filePath,
  source: fs.readFileSync(filePath, "utf8"),
}));
const factorySources = collectFactorySources().map((filePath) => ({
  filePath,
  source: fs.readFileSync(filePath, "utf8"),
}));

const catalogTables = extractCatalogTablesFromMigrations();
const missing = [];

for (const tableName of catalogTables) {
  const inRoutes = routeSources.some(({ source }) => hasTableRegistration(source, tableName));
  const inFactory = factorySources.some(({ source }) => hasTableRegistration(source, tableName));
  if (!inRoutes && !inFactory) {
    missing.push(tableName);
  }
}

const unexpectedMissing = missing.filter((tableName) => !KNOWN_STUB_TABLES.includes(tableName)).sort();
if (unexpectedMissing.length > 0) {
  fail(`catalog tables without factory registration: ${unexpectedMissing.join(", ")}`);
}

const sortedMissing = [...missing].sort();
const sortedKnownStubs = [...KNOWN_STUB_TABLES].sort();
if (sortedMissing.join(",") !== sortedKnownStubs.join(",")) {
  fail(
    `catalog stub baseline drift: expected [${sortedKnownStubs.join(", ")}] but found [${sortedMissing.join(", ")}]`
  );
}

pass(`${catalogTables.length} catalog tables checked; ${sortedKnownStubs.length} grandfathered stubs; fleet.equipment_types wired`);
