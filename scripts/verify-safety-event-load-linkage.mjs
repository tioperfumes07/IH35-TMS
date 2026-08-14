#!/usr/bin/env node
// verify-safety-event-load-linkage (biz-flow-1-termination-not-linked-to-load — non-financial read slice)
// LINKAGE-LAW Clause 3 (cross-module drill-through): a safety.safety_events row carries related_load_id;
// the read endpoints must SURFACE the load (load_number) via an entity-scoped LEFT JOIN mdata.loads so the
// UI can render a load drill-through, not a bare UUID. Guards against the join / alias / entity-scope being
// removed (which would silently drop the reverse safety-event -> load link). Read-only; no financial write.
// Self-test: node scripts/verify-safety-event-load-linkage.mjs --selftest

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROUTE = "apps/backend/src/safety/events/safety-events.routes.ts";
const API = "apps/frontend/src/api/safety.ts";
const REVERSE = "apps/frontend/src/components/safety/SafetyEventsReverseBlock.tsx";
const DRIVER = "apps/frontend/src/components/safety/DriverSafetyReverseSection.tsx";
const ASSET = "apps/frontend/src/components/safety/AssetSafetyReverseSection.tsx";
const ENTITY_LINK = "apps/frontend/src/components/shared/EntityLink.tsx";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function checkRoute(src) {
  const failures = [];
  // Entity-scoped join to mdata.loads on related_load_id (must appear in BOTH list + detail queries).
  const joins = src.match(
    /LEFT\s+JOIN\s+mdata\.loads\s+l\s+ON\s+l\.id\s*=\s*e\.related_load_id\s+AND\s+l\.operating_company_id\s*=\s*e\.operating_company_id/gi
  );
  if (!joins || joins.length < 2) {
    failures.push(
      `safety-events.routes.ts must entity-scope-join mdata.loads on related_load_id in BOTH read queries (found ${
        joins ? joins.length : 0
      }/2)`
    );
  }
  // The load_number must be surfaced as related_load_number.
  const aliases = src.match(/l\.load_number\s+AS\s+related_load_number/gi);
  if (!aliases || aliases.length < 2) {
    failures.push(
      `safety-events.routes.ts must select l.load_number AS related_load_number in BOTH read queries (found ${
        aliases ? aliases.length : 0
      }/2)`
    );
  }
  return failures;
}

export function checkApi(src) {
  const failures = [];
  if (!/related_load_number\??:\s*string\s*\|\s*null/.test(src)) {
    failures.push("api/safety.ts SafetyEventLogRow must expose related_load_number (surfaced load reference)");
  }
  return failures;
}

export function checkVertical(route, api, reverse, driver, asset, entityLink) {
  const failures = [];
  for (const field of ["subject_driver_id", "subject_unit_id"]) {
    if (!new RegExp(`${field}:\\s*z\\.string\\(\\)\\.uuid\\(\\)\\.optional`).test(route) || !new RegExp(`e\\.${field} = \\$\\$\\{values\\.length\\}`).test(route)) failures.push(`events list must filter ${field} server-side`);
    if (!new RegExp(`${field}\\?:\\s*string`).test(api) || !new RegExp(`qs\\.set\\("${field}"`).test(api)) failures.push(`events client must forward ${field}`);
  }
  if (!/related_entity_not_in_operating_company/.test(route) || !/FROM mdata\.drivers/.test(route) || !/FROM mdata\.units/.test(route) || !/FROM mdata\.loads/.test(route)) failures.push("event writer must company-validate driver, unit, and load FKs");
  if (!/subject === "driver" \? \{ subject_driver_id: entityId \} : \{ subject_unit_id: entityId \}/.test(reverse) || !/kind="safety_event"/.test(reverse) || !/kind=\{subject === "driver" \? "safety_events_driver" : "safety_events_unit"\}/.test(reverse)) failures.push("shared event reverse block must use exact filters and canonical drill");
  if (!/<SafetyEventsReverseBlock[^>]*subject="driver"/.test(driver)) failures.push("driver safety profile must mount event reverse history");
  if (!/isUnit \? <SafetyEventsReverseBlock[^>]*subject="unit"/.test(asset)) failures.push("unit profile must mount event reverse history without inventing trailer linkage");
  if (!/case "safety_event":\s*return `\/safety\/safety-events\?event_id=\$\{id\}`/.test(entityLink)) failures.push("EntityLink must resolve exact safety-event drill-through");
  if (!/case "safety_events_driver":\s*return `\/safety\/safety-events\?subject_driver_id=\$\{id\}`/.test(entityLink) || !/case "safety_events_unit":\s*return `\/safety\/safety-events\?subject_unit_id=\$\{id\}`/.test(entityLink)) failures.push("EntityLink must resolve filtered safety-events queue drill-through");
  return failures;
}

export function run() {
  const failures = [];
  let route;
  let api;
  try {
    route = read(ROUTE);
  } catch {
    return [`${ROUTE} not found`];
  }
  try {
    api = read(API);
  } catch {
    return [`${API} not found`];
  }
  failures.push(...checkRoute(route));
  failures.push(...checkApi(api));
  const extra = [REVERSE, DRIVER, ASSET, ENTITY_LINK].map((rel) => read(rel));
  failures.push(...checkVertical(route, api, ...extra));
  return failures;
}

if (process.argv.includes("--selftest")) {
  const goodRoute = `
    SELECT e.related_load_id::text, l.load_number AS related_load_number
    FROM safety.safety_events e
    LEFT JOIN mdata.loads l ON l.id = e.related_load_id AND l.operating_company_id = e.operating_company_id
    WHERE x;
    SELECT e.related_load_id::text, l.load_number AS related_load_number
    FROM safety.safety_events e
    LEFT JOIN mdata.loads l ON l.id = e.related_load_id AND l.operating_company_id = e.operating_company_id
    WHERE y;
  `;
  const goodApi = "related_load_number?: string | null;";
  const noScope = goodRoute.replace(/ AND l\.operating_company_id = e\.operating_company_id/g, "");
  const liveRoute = read(ROUTE);
  const liveApi = read(API);
  const liveExtra = [REVERSE, DRIVER, ASSET, ENTITY_LINK].map((rel) => read(rel));
  const checks = [
    ["good route+api passes", checkRoute(goodRoute).length === 0 && checkApi(goodApi).length === 0],
    ["missing entity-scope is caught", checkRoute(noScope).length > 0],
    ["missing api field is caught", checkApi("subject_unit_number?: string | null;").length > 0],
    ["live vertical chain passes", checkVertical(liveRoute, liveApi, ...liveExtra).length === 0],
    ["driver filter removal is caught", checkVertical(liveRoute.replace("e.subject_driver_id = $${values.length}::uuid", "TRUE"), liveApi, ...liveExtra).length > 0],
    ["writer validation removal is caught", checkVertical(liveRoute.replace("related_entity_not_in_operating_company", "invalid"), liveApi, ...liveExtra).length > 0],
    ["reverse filter removal is caught", checkVertical(liveRoute, liveApi, liveExtra[0].replace("subject_driver_id: entityId", "subject_driver_id: undefined"), ...liveExtra.slice(1)).length > 0],
    ["unit mount removal is caught", checkVertical(liveRoute, liveApi, liveExtra[0], liveExtra[1], liveExtra[2].replace("<SafetyEventsReverseBlock", "<MissingSafetyEventsReverseBlock"), liveExtra[3]).length > 0],
    ["deep-link removal is caught", checkVertical(liveRoute, liveApi, ...liveExtra.slice(0, 3), liveExtra[3].replace('case "safety_event":', 'case "missing_safety_event":')).length > 0],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error("verify:safety-event-load-linkage --selftest FAIL:");
    for (const [n] of failed) console.error("  ✗ " + n);
    process.exit(1);
  }
  console.log(`verify:safety-event-load-linkage --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const failures = run();
  if (failures.length) {
    console.error("verify:safety-event-load-linkage FAIL:");
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log("verify:safety-event-load-linkage PASS (safety-event -> load reverse link surfaced, entity-scoped)");
}
