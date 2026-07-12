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
  const checks = [
    ["good route+api passes", checkRoute(goodRoute).length === 0 && checkApi(goodApi).length === 0],
    ["missing entity-scope is caught", checkRoute(noScope).length > 0],
    ["missing api field is caught", checkApi("subject_unit_number?: string | null;").length > 0],
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
