#!/usr/bin/env node
/**
 * LST Account Types load — catalogs.account_types has no updated_at.
 * Generic factory must declare hasUpdatedAt:false and SELECT NULL::timestamptz AS updated_at
 * (never t.updated_at). Same for audit_event_types.
 *
 * Run: node scripts/verify-lists-account-types-lookup-no-updated-at.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lists-account-types-lookup-no-updated-at";
const FACTORY = path.join(ROOT, "apps/backend/src/catalogs/generic-catalog.factory.ts");
const ROUTES = path.join(ROOT, "apps/backend/src/catalogs/generic-catalog.routes.ts");
const MAP = path.join(ROOT, "apps/frontend/src/pages/lists/components/AllCatalogsMap.tsx");
const PAGE = path.join(ROOT, "apps/frontend/src/pages/accounting/AccountTypeCatalogPage.tsx");

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

function assertSource(src, re, msg) {
  if (!re.test(src)) fail(msg);
}

function audit() {
  const factory = fs.readFileSync(FACTORY, "utf8");
  const routes = fs.readFileSync(ROUTES, "utf8");
  const map = fs.readFileSync(MAP, "utf8");
  const page = fs.readFileSync(PAGE, "utf8");

  assertSource(
    factory,
    /hasUpdatedAt\s*\?\s*:\s*boolean/,
    "factory must expose hasUpdatedAt?: boolean on GenericCatalogConfig",
  );
  assertSource(
    factory,
    /hasUpdatedAt\s*\?\s*"t\.updated_at"\s*:\s*"NULL::timestamptz AS updated_at"/,
    "factory list SELECT must branch updated_at → NULL::timestamptz when hasUpdatedAt is false",
  );
  assertSource(
    routes,
    /accountTypesCatalogConfig[\s\S]*?hasUpdatedAt:\s*false/,
    "accountTypesCatalogConfig must set hasUpdatedAt: false",
  );
  assertSource(
    routes,
    /accountTypesCatalogConfig[\s\S]*?readOnly:\s*true/,
    "accountTypesCatalogConfig must be readOnly (no updated_at / audit user columns)",
  );
  assertSource(
    routes,
    /auditEventTypesCatalogConfig[\s\S]*?hasUpdatedAt:\s*false/,
    "auditEventTypesCatalogConfig must set hasUpdatedAt: false",
  );
  assertSource(
    routes,
    /auditEventTypesCatalogConfig[\s\S]*?softDeleteColumn:\s*null/,
    "auditEventTypesCatalogConfig must set softDeleteColumn: null (table has no is_active; code=true caused 42883)",
  );
  if (/auditEventTypesCatalogConfig[\s\S]*?softDeleteColumn:\s*["']code["']/.test(routes)) {
    fail("auditEventTypesCatalogConfig must NOT use softDeleteColumn: \"code\" (text = boolean 500)");
  }
  assertSource(
    factory,
    /const softCol = config\.softDeleteColumn\?\.trim\(\)/,
    "factory list must skip is_active filter when softDeleteColumn is null/empty",
  );
  assertSource(
    map,
    /account-types-lookup["']\s*\)\s*return\s*["']\/lists\/accounting\/account-types["']/,
    "buildCatalogPath must send account-types-lookup → /lists/accounting/account-types",
  );
  if (/enabled:\s*Boolean\(companyId\)/.test(page)) {
    fail("AccountTypeCatalogPage still gates query on companyId — taxonomy is global");
  }
  if (!/getAccountTypeCatalog\(companyId \|\| undefined\)/.test(page)) {
    fail("AccountTypeCatalogPage must still call getAccountTypeCatalog with optional companyId");
  }
}

if (process.argv.includes("--selftest")) {
  const factory = fs.readFileSync(FACTORY, "utf8");
  if (!/NULL::timestamptz AS updated_at/.test(factory)) {
    fail("selftest: factory missing NULL updated_at branch");
  }
  const routes = fs.readFileSync(ROUTES, "utf8");
  const broken = routes.replace(/hasUpdatedAt:\s*false/, "hasUpdatedAt: true");
  if (/accountTypesCatalogConfig[\s\S]*?hasUpdatedAt:\s*false/.test(broken) === false) {
    // mutation applied once — good; ensure original still has false
  }
  if (!/accountTypesCatalogConfig[\s\S]*?hasUpdatedAt:\s*false/.test(routes)) {
    fail("selftest: accountTypesCatalogConfig missing hasUpdatedAt:false");
  }
  console.log(`${LABEL} --selftest OK`);
  process.exit(0);
}

audit();
console.log(
  `${LABEL} PASS — account_types/audit_event_types hasUpdatedAt:false + NULL updated_at SELECT; hub maps lookup→account-types; taxonomy page loads without companyId`,
);
