#!/usr/bin/env node
// CATALOG-AUDIT-EVENT-TYPES-GET-500 — guard
//
// /lists/catalogs/accounting/audit-event-types live-500'd: GET /api/v1/catalogs/accounting/audit-event-types
// returned {"code":"42703","message":"column t.id does not exist"}. Root cause: generic-catalog.factory.ts's
// list-mode SELECT unconditionally hardcoded `"t.id"` with no opt-out (unlike the sibling `hasUpdatedAt`
// flag, which already exists for this exact same table's missing `updated_at`) — but
// catalogs.audit_event_types has no `id` column at all (code/description/severity_default/created_at
// only). Fix: a new `idColumn` config option (defaults to "id", identical behavior for every other
// catalog), set to "code" for this one table so the factory selects+aliases the real natural key instead
// of a column that doesn't exist. This guard fails if either the config wiring or the factory's
// column-selection logic regresses.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const ROUTES_FILE = "apps/backend/src/catalogs/generic-catalog.routes.ts";
const FACTORY_FILE = "apps/backend/src/catalogs/generic-catalog.factory.ts";

export function check(routesText, factoryText) {
  const failures = [];

  const idx = routesText.indexOf("export const auditEventTypesCatalogConfig");
  const block = idx >= 0 ? routesText.slice(idx, idx + 1500) : "";
  if (!/^\s*idColumn:\s*"code",\s*$/m.test(block)) {
    failures.push(`${ROUTES_FILE} auditEventTypesCatalogConfig no longer sets idColumn: "code"`);
  }
  if (!/catalogName:\s*"catalogs\.audit_event_types"/.test(block)) {
    failures.push(`${ROUTES_FILE} auditEventTypesCatalogConfig's catalogName reverted to the wrong "audit." schema prefix`);
  }

  if (!/const idDbColumn = config\.idColumn \?\? "id";/.test(factoryText)) {
    failures.push(`${FACTORY_FILE} no longer computes idDbColumn from config.idColumn with an "id" fallback`);
  }
  if (!/`t\.\$\{idDbColumn\} AS id`/.test(factoryText)) {
    failures.push(`${FACTORY_FILE} selectColumns no longer uses the idDbColumn-derived id alias — likely reverted to the hardcoded "t.id" that 500s on tables with no id column`);
  }
  if (/^\s*"t\.id",\s*$/m.test(factoryText)) {
    failures.push(`${FACTORY_FILE} still contains the old hardcoded "t.id" selectColumns entry`);
  }

  return failures;
}

function run() {
  const routesText = fs.readFileSync(path.join(root, ROUTES_FILE), "utf8");
  const factoryText = fs.readFileSync(path.join(root, FACTORY_FILE), "utf8");
  const failures = check(routesText, factoryText);
  if (failures.length > 0) {
    console.error("FAIL: catalog-audit-event-types-id-column");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: audit_event_types catalog config selects its real natural key (code) as id instead of a nonexistent t.id column");
}

function selftest() {
  const routesText = fs.readFileSync(path.join(root, ROUTES_FILE), "utf8");
  const factoryText = fs.readFileSync(path.join(root, FACTORY_FILE), "utf8");

  const offenderRoutes = routesText.replace(/\n  idColumn: "code",/, "");
  if (offenderRoutes === routesText) {
    console.error("FAIL(selftest): offender mutation did not change generic-catalog.routes.ts — pattern out of sync");
    process.exit(1);
  }
  const failuresA = check(offenderRoutes, factoryText);
  if (failuresA.length === 0) {
    console.error("FAIL(selftest): planted offender (idColumn removed from config) was NOT caught");
    process.exit(1);
  }

  const offenderFactory = factoryText.replace('`t.${idDbColumn} AS id`', '"t.id"');
  if (offenderFactory === factoryText) {
    console.error("FAIL(selftest): offender mutation did not change generic-catalog.factory.ts — pattern out of sync");
    process.exit(1);
  }
  const failuresB = check(routesText, offenderFactory);
  if (failuresB.length === 0) {
    console.error("FAIL(selftest): planted offender (selectColumns reverted to hardcoded t.id) was NOT caught");
    process.exit(1);
  }

  console.log("PASS(selftest): both planted regressions correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
