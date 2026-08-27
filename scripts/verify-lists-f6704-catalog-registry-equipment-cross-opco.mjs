#!/usr/bin/env node
// LISTS-F6704-CATALOG-REGISTRY-EQUIPMENT-CROSS-OPCO-STATS-PREVIEW — guard
//
// catalog-registry.routes.ts resolves the caller's company but discarded it before the EQUIPMENT_TYPES
// and DRIVER_LOAD_STATUSES stats/preview queries — both tables are company-owned (100% non-null
// operating_company_id, verified live) and BOTH carry a leftover unconditional `USING (true)` RLS policy
// alongside their real company_scope policy (Postgres OR's permissive policies together — see
// CATALOG-EQUIPMENT-TYPES-AND-DRIVER-LOAD-STATUSES-STALE-SELECT-ALL-RLS-POLICY-DEFEATS-ENTITY-SCOPE), so
// RLS alone does not scope these two reads. Any owner session therefore saw stats/preview counts
// aggregated across every entity instead of just their own. Fix: an explicit
// `AND operating_company_id = $1::uuid` predicate on both queries, matching the pattern
// CHART_OF_ACCOUNTS/CLASSES already use, with fetchCatalogStats now threading the resolved
// operatingCompanyId through instead of discarding it.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const REGISTRY_FILE = "apps/backend/src/catalogs/catalog-registry.routes.ts";

export function check(text) {
  const failures = [];

  const statsIdx = text.indexOf("const CATALOG_REGISTRY_STATS_SQL");
  const statsBlock = statsIdx >= 0 ? text.slice(statsIdx, statsIdx + 1200) : "";
  if (!/EQUIPMENT_TYPES:\s*\n\s*"[^"]*operating_company_id = \$1::uuid/.test(statsBlock)) {
    failures.push(`${REGISTRY_FILE} CATALOG_REGISTRY_STATS_SQL.EQUIPMENT_TYPES lost its operating_company_id = $1 predicate`);
  }
  if (!/DRIVER_LOAD_STATUSES:\s*\n\s*"[^"]*operating_company_id = \$1::uuid/.test(statsBlock)) {
    failures.push(`${REGISTRY_FILE} CATALOG_REGISTRY_STATS_SQL.DRIVER_LOAD_STATUSES lost its operating_company_id = $1 predicate`);
  }

  if (!/async function fetchCatalogStats\([\s\S]*?operatingCompanyId: string \| null[\s\S]*?\)\s*\{/.test(text)) {
    failures.push(`${REGISTRY_FILE} fetchCatalogStats no longer accepts operatingCompanyId`);
  }
  if (!/fetchCatalogStats\(client, String\(row\.code\), operatingCompanyId\)/.test(text)) {
    failures.push(`${REGISTRY_FILE} the registry-index call site no longer threads operatingCompanyId into fetchCatalogStats`);
  }

  const previewIdx = text.indexOf("EQUIPMENT_TYPES: {");
  const previewBlock = previewIdx >= 0 ? text.slice(previewIdx, previewIdx + 900) : "";
  if (!/FROM catalogs\.equipment_types[\s\S]*?operating_company_id = \$1::uuid/.test(previewBlock)) {
    failures.push(`${REGISTRY_FILE} EQUIPMENT_TYPES preview SQL lost its operating_company_id = $1 predicate`);
  }

  const dlsIdx = text.indexOf("DRIVER_LOAD_STATUSES: {");
  const dlsBlock = dlsIdx >= 0 ? text.slice(dlsIdx, dlsIdx + 900) : "";
  if (!/FROM catalogs\.driver_load_statuses[\s\S]*?operating_company_id = \$1::uuid/.test(dlsBlock)) {
    failures.push(`${REGISTRY_FILE} DRIVER_LOAD_STATUSES preview SQL lost its operating_company_id = $1 predicate`);
  }

  return failures;
}

function run() {
  const text = fs.readFileSync(path.join(root, REGISTRY_FILE), "utf8");
  const failures = check(text);
  if (failures.length > 0) {
    console.error("FAIL: lists-f6704-catalog-registry-equipment-cross-opco");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: catalog registry EQUIPMENT_TYPES/DRIVER_LOAD_STATUSES stats+preview are explicitly entity-scoped");
}

function selftest() {
  const text = fs.readFileSync(path.join(root, REGISTRY_FILE), "utf8");

  const offenderStats = text.replace(
    '"SELECT count(*)::int AS item_count, MAX(updated_at) AS last_updated_at FROM catalogs.equipment_types WHERE deactivated_at IS NULL AND is_active = true AND operating_company_id = $1::uuid"',
    '"SELECT count(*)::int AS item_count, MAX(updated_at) AS last_updated_at FROM catalogs.equipment_types WHERE deactivated_at IS NULL AND is_active = true"'
  );
  if (offenderStats === text) {
    console.error("FAIL(selftest): offender mutation did not change the file — pattern out of sync");
    process.exit(1);
  }
  const failuresA = check(offenderStats);
  if (failuresA.length === 0) {
    console.error("FAIL(selftest): planted offender (stats predicate removed) was NOT caught");
    process.exit(1);
  }

  const offenderCallsite = text.replace(
    "fetchCatalogStats(client, String(row.code), operatingCompanyId)",
    "fetchCatalogStats(client, String(row.code))"
  );
  if (offenderCallsite === text) {
    console.error("FAIL(selftest): offender mutation did not change the call site — pattern out of sync");
    process.exit(1);
  }
  const failuresB = check(offenderCallsite);
  if (failuresB.length === 0) {
    console.error("FAIL(selftest): planted offender (call site stopped threading operatingCompanyId) was NOT caught");
    process.exit(1);
  }

  console.log("PASS(selftest): both planted regressions correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
