#!/usr/bin/env node
// 0243-g9-h4 — driver PWA arrival/departure must funnel mdata.loads.status writes through
// validateLoadStopStatusWrite (same gate as dispatch-view.routes.ts and bulk/transition paths).
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const failures = [];

function fail(message) {
  failures.push(message);
}

function read(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) {
    fail(`MISSING: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function contains(relativePath, content, checks) {
  if (!content) return;
  for (const check of checks) {
    const pattern = check.pattern instanceof RegExp ? check.pattern : new RegExp(check.pattern);
    if (!pattern.test(content)) {
      fail(`${relativePath}: missing ${check.label}`);
    }
  }
}

function auditScopedStatusHandlers(relativePath, content, handlers) {
  const issues = [];
  for (const { label, start, end } of handlers) {
    // Route URLs also appear in the dispatch-view file header; bind the actual handler declaration,
    // which is the final occurrence before the next route, never the descriptive comment.
    const from = content.lastIndexOf(start);
    const to = end ? content.indexOf(end, from + start.length) : content.length;
    const block = from < 0 ? "" : content.slice(from, to < 0 ? content.length : to);
    const require = (pattern, message) => {
      if (!pattern.test(block)) issues.push(`${relativePath}: ${label} ${message}`);
    };
    require(/l\.operating_company_id::text AS operating_company_id/, "must capture immutable load company");
    require(/company_id = l\.operating_company_id/, "must admit only same-company or actively authorized drivers");
    require(/is_authorized = true/, "must require active shared-driver authorization");
    require(/deactivated_at IS NULL/, "must reject deactivated shared-driver authorization");
    require(
      /UPDATE mdata\.loads SET status = \$2 WHERE id = \$1 AND operating_company_id = \$3::uuid/,
      "status UPDATE must bind exact captured company"
    );
    require(
      /\[params\.data\.(?:id|uuid), nextLoadStatus, stop\.operating_company_id\]/,
      "status UPDATE parameters must use the captured load company"
    );
  }
  return issues;
}

const driverLoads = read("apps/backend/src/driver/loads.routes.ts");
contains("apps/backend/src/driver/loads.routes.ts", driverLoads, [
  { pattern: /validateLoadStopStatusWrite/, label: "import shared load-status gate" },
  { pattern: /\/api\/v1\/driver\/loads\/:id\/stops\/:stopId\/arrive/, label: "arrive route" },
  { pattern: /\/api\/v1\/driver\/loads\/:id\/stops\/:stopId\/depart/, label: "depart route" },
  { pattern: /load_status/, label: "load_status selected before status write" },
  { pattern: /invalid_load_state/, label: "invalid_load_state rejection" },
]);

// Arrive + depart handlers must each call the gate before UPDATE mdata.loads
const arriveIdx = driverLoads.indexOf("/api/v1/driver/loads/:id/stops/:stopId/arrive");
const departIdx = driverLoads.indexOf("/api/v1/driver/loads/:id/stops/:stopId/depart");
const arriveBlock = arriveIdx >= 0 ? driverLoads.slice(arriveIdx, departIdx) : "";
const departBlock = departIdx >= 0 ? driverLoads.slice(departIdx) : "";
for (const [label, block] of [
  ["arrive", arriveBlock],
  ["depart", departBlock],
]) {
  if (!block.includes("validateLoadStopStatusWrite")) {
    fail(`apps/backend/src/driver/loads.routes.ts: ${label} handler missing validateLoadStopStatusWrite`);
  }
  const gatePos = block.indexOf("validateLoadStopStatusWrite");
  const updatePos = block.indexOf("UPDATE mdata.loads SET status");
  if (gatePos < 0 || updatePos < 0 || gatePos > updatePos) {
    fail(`apps/backend/src/driver/loads.routes.ts: ${label} must call gate before UPDATE mdata.loads`);
  }
}

const dispatchView = read("apps/backend/src/dispatch/driver-pwa/dispatch-view.routes.ts");
contains("apps/backend/src/dispatch/driver-pwa/dispatch-view.routes.ts", dispatchView, [
  { pattern: /validateLoadStopStatusWrite/, label: "dispatch-view parity gate" },
]);

const scopeIssues = [
  ...auditScopedStatusHandlers("apps/backend/src/driver/loads.routes.ts", driverLoads, [
    {
      label: "arrive",
      start: "/api/v1/driver/loads/:id/stops/:stopId/arrive",
      end: "/api/v1/driver/loads/:id/stops/:stopId/depart",
    },
    { label: "depart", start: "/api/v1/driver/loads/:id/stops/:stopId/depart" },
  ]),
  ...auditScopedStatusHandlers("apps/backend/src/dispatch/driver-pwa/dispatch-view.routes.ts", dispatchView, [
    {
      label: "arrival",
      start: "/api/dispatch/driver-pwa/load/:uuid/stops/:stop_uuid/arrival",
      end: "/api/dispatch/driver-pwa/load/:uuid/stops/:stop_uuid/departure",
    },
    {
      label: "departure",
      start: "/api/dispatch/driver-pwa/load/:uuid/stops/:stop_uuid/departure",
      end: "/api/dispatch/driver-pwa/load/:uuid/stops/:stop_uuid/document",
    },
  ]),
];
for (const issue of scopeIssues) fail(issue);

if (process.argv.includes("--selftest")) {
  const brokenDriver = driverLoads
    .replaceAll("l.operating_company_id::text AS operating_company_id", "NULL::text AS operating_company_id")
    .replaceAll("AND operating_company_id = $3::uuid", "")
    .replaceAll(".is_authorized = true", ".is_authorized = false");
  const brokenDispatch = dispatchView
    .replaceAll("l.operating_company_id::text AS operating_company_id", "NULL::text AS operating_company_id")
    .replaceAll("AND operating_company_id = $3::uuid", "")
    .replaceAll(".deactivated_at IS NULL", ".deactivated_at IS NOT NULL");
  const planted = [
    ...auditScopedStatusHandlers("driver", brokenDriver, [
      { label: "arrive", start: "/api/v1/driver/loads/:id/stops/:stopId/arrive", end: "/api/v1/driver/loads/:id/stops/:stopId/depart" },
      { label: "depart", start: "/api/v1/driver/loads/:id/stops/:stopId/depart" },
    ]),
    ...auditScopedStatusHandlers("dispatch-view", brokenDispatch, [
      { label: "arrival", start: "/api/dispatch/driver-pwa/load/:uuid/stops/:stop_uuid/arrival", end: "/api/dispatch/driver-pwa/load/:uuid/stops/:stop_uuid/departure" },
      { label: "departure", start: "/api/dispatch/driver-pwa/load/:uuid/stops/:stop_uuid/departure", end: "/api/dispatch/driver-pwa/load/:uuid/stops/:stop_uuid/document" },
    ]),
  ];
  if (scopeIssues.length || planted.length < 12) {
    console.error(`verify:driver-pwa-load-status-gate SELFTEST FAILED — clean=${scopeIssues.length}, planted=${planted.length}`);
    process.exit(1);
  }
  console.log(`verify:driver-pwa-load-status-gate SELFTEST PASS — ${planted.length} planted scope defects caught`);
  process.exit(0);
}

read("apps/backend/src/dispatch/load-state-machine.ts");

const pkg = read("package.json");
contains("package.json", pkg, [
  { pattern: /verify:driver-pwa-load-status-gate/, label: "npm script for verify gate" },
]);

const lockedGuards = read(".github/workflows/locked-guards.yml");
contains(".github/workflows/locked-guards.yml", lockedGuards, [
  { pattern: /verify:driver-pwa-load-status-gate/, label: "locked-guards runs verify gate" },
]);

if (failures.length > 0) {
  console.error("verify:driver-pwa-load-status-gate — FAILED");
  for (const entry of failures) {
    console.error(`  ✗ ${entry}`);
  }
  process.exit(1);
}

console.log("verify:driver-pwa-load-status-gate — OK");
