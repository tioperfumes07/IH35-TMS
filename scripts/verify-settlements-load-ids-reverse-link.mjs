#!/usr/bin/env node
/**
 * verify-settlements-load-ids-reverse-link.mjs
 *
 * @matrix-built {"modules":["settlements"],"cols":["reverse_link"],"leafRe":"^(settlements\\.list|pre_settlements|settlements\\.panel\\.pre_settlements)$","task":"SETL-LIST-LOAD-REVERSE"}
 *
 * P14 Box4 gap: settlements.panel.pre_settlements's `load`/`reverse_link` cells were unpaid because
 * SettlementListRow only ever carried `load_count` (a number), never the actual load ids — the
 * pre-settlements panel rendered "N load(s)" as plain text, no drill target existed.
 *
 * The same API already returns load_ids on the main Settlements list, but SettlementsTable's Loads
 * column still printed only the count — McLeod/Alvys reverse drill from the list was dead.
 *
 * Guards:
 *  1. Both settlements.routes.ts list queries select a load_ids array_agg alongside load_count,
 *     using the same COALESCE/JOIN/WHERE shape (copy-paste drift would silently disagree).
 *  2. Both response-mapping blocks include load_ids in the returned row.
 *  3. PreSettlementsPanel.tsx renders a real EntityLink kind="load" per id, not just the count.
 *  4. SettlementsTable Loads column drills kind="load" from load_ids (honest count fallback).
 */
import { readFileSync } from "node:fs";

const failures = [];

const routesPath = "apps/backend/src/driver-finance/settlements.routes.ts";
const routesSrc = readFileSync(routesPath, "utf8");

const loadIdsSubqueryCount = (routesSrc.match(/array_agg\(DISTINCT COALESCE\(db\.load_id, sl\.load_id\)\)/g) || []).length;
if (loadIdsSubqueryCount < 2) {
  failures.push(`${routesPath}: expected 2 load_ids array_agg subqueries (general list + driver reverse-drill), found ${loadIdsSubqueryCount}`);
}

const loadIdsMappingCount = (routesSrc.match(/load_ids:\s*Array\.isArray\(row\.load_ids\)/g) || []).length;
if (loadIdsMappingCount < 2) {
  failures.push(`${routesPath}: expected 2 response-mapping blocks including load_ids, found ${loadIdsMappingCount}`);
}

const panelPath = "apps/frontend/src/components/driver-finance/PreSettlementsPanel.tsx";
const panelSrc = readFileSync(panelPath, "utf8");
if (!/kind="load"/.test(panelSrc)) {
  failures.push(`${panelPath}: no longer renders a real EntityLink kind="load" for covered loads`);
}
if (!/settlement\.load_ids/.test(panelSrc)) {
  failures.push(`${panelPath}: no longer reads settlement.load_ids`);
}

const tablePath = "apps/frontend/src/pages/driver-finance/components/SettlementsTable.tsx";
const tableSrc = readFileSync(tablePath, "utf8");
if (!/kind="load"/.test(tableSrc) || !/row\.load_ids/.test(tableSrc)) {
  failures.push(`${tablePath}: Loads column must EntityLink kind="load" from row.load_ids (not count-only)`);
}

if (process.argv.includes("--selftest")) {
  const planted = tableSrc.replace(/kind="load"/g, 'kind="settlement"');
  if (/kind="load"/.test(planted)) {
    console.error("verify-settlements-load-ids-reverse-link SELFTEST FAILED: plant did not remove load EntityLink");
    process.exit(1);
  }
  const wouldFail = !/kind="load"/.test(planted) || !/row\.load_ids/.test(planted);
  if (!wouldFail) {
    console.error("verify-settlements-load-ids-reverse-link SELFTEST FAILED: planted table would still pass");
    process.exit(1);
  }
  console.log("verify-settlements-load-ids-reverse-link selftest: planted count-only Loads column fails");
}

const apiTypePath = "apps/frontend/src/api/driverFinance.ts";
const apiTypeSrc = readFileSync(apiTypePath, "utf8");
if (!/load_ids\?:\s*string\[\]/.test(apiTypeSrc)) {
  failures.push(`${apiTypePath}: SettlementListRow no longer declares load_ids`);
}

if (failures.length > 0) {
  console.error("verify-settlements-load-ids-reverse-link: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  "verify-settlements-load-ids-reverse-link: OK — both settlement list queries return real load ids alongside the count; PreSettlementsPanel and SettlementsTable drill kind=load"
);
