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
