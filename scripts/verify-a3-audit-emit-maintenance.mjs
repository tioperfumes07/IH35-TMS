#!/usr/bin/env node
/**
 * verify-a3-audit-emit-maintenance.mjs
 * Assert that maintenance WO mutations emit spine events via emitMaintenanceSpineEvent calling events.log_event().
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();

function read(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) { console.error(`FAIL: missing file: ${rel}`); process.exit(1); }
  return fs.readFileSync(abs, "utf8");
}

let failed = false;
function fail(msg) { console.error(`[verify-a3] FAIL: ${msg}`); failed = true; }
function pass(msg) { console.log(`[verify-a3] PASS: ${msg}`); }

// 1. Helper must exist and call events.log_event
const helperSrc = read("apps/backend/src/maintenance/maintenance-spine-emit.ts");
if (!helperSrc.includes("events.log_event")) fail("maintenance-spine-emit.ts does not call events.log_event()");
else pass("maintenance-spine-emit.ts calls events.log_event()");

if (/INSERT\s+INTO\s+events\.event_log/i.test(helperSrc)) fail("maintenance-spine-emit.ts bypasses log_event() with raw INSERT");
else pass("maintenance-spine-emit.ts does not bypass log_event()");

// 2. work-orders.routes.ts must import and use emitMaintenanceSpineEvent for all 5 events
const wor = read("apps/backend/src/maintenance/work-orders.routes.ts");
if (!wor.includes("emitMaintenanceSpineEvent")) fail("work-orders.routes.ts: missing emitMaintenanceSpineEvent import/call");
else pass("work-orders.routes.ts: imports emitMaintenanceSpineEvent");

const expectedEvents = ["wo.created", "wo.completed", "wo.status_changed", "wo.line_item_added", "wo.line_item_removed"];
for (const ev of expectedEvents) {
  if (!wor.includes(`"${ev}"`)) fail(`work-orders.routes.ts: missing emit for "${ev}"`);
  else pass(`work-orders.routes.ts: emits "${ev}"`);
}

// 3. MaintenanceSpineEvent union must cover all expected types
for (const ev of expectedEvents) {
  if (!helperSrc.includes(`"${ev}"`)) fail(`maintenance-spine-emit.ts: union missing "${ev}"`);
  else pass(`MaintenanceSpineEvent union includes "${ev}"`);
}

if (failed) { console.error("\n[verify-a3] FAILED"); process.exit(1); }
console.log("\n[verify-a3] ALL CHECKS PASSED");
