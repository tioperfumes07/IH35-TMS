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

// 4. Regression guard (2026-07, audit-spine-emit-silent-failures): the hardcoded subject_type literal
// passed to events.log_event() must be a member of events.event_log's `valid_subject_type` CHECK
// allowlist (db/migrations/202606111050_w1a_event_log_spine.sql:
// load|driver|unit|geofence|document|assignment|status|broker|task|alert). The original 'work_order'
// literal was NOT a member and unconditionally violated the CHECK on every emit — fixed to 'task'.
// This guard greps the literal directly out of the events.log_event(...) call so a future edit can't
// silently reintroduce an invalid value.
const VALID_SUBJECT_TYPES = ["load", "driver", "unit", "geofence", "document", "assignment", "status", "broker", "task", "alert"];
const logEventCallMatch = helperSrc.match(/events\.log_event\(([\s\S]*?)\)`/);
if (!logEventCallMatch) {
  fail("could not locate the events.log_event(...) call in maintenance-spine-emit.ts to check subject_type");
} else {
  const callBody = logEventCallMatch[1];
  // p_subject_type is the 5th positional argument; find the literal 'quoted' token in that slot.
  const args = callBody.split(",").map((s) => s.trim());
  const subjectTypeArg = args[4] ?? "";
  const literalMatch = subjectTypeArg.match(/^'([a-z_]+)'$/);
  if (!literalMatch) {
    fail(`maintenance-spine-emit.ts: subject_type (5th arg = "${subjectTypeArg}") is not a hardcoded string literal — update this guard if that's intentional`);
  } else if (!VALID_SUBJECT_TYPES.includes(literalMatch[1])) {
    fail(`maintenance-spine-emit.ts: subject_type '${literalMatch[1]}' is NOT in events.event_log's valid_subject_type allowlist`);
  } else {
    pass(`maintenance-spine-emit.ts: subject_type '${literalMatch[1]}' is in the valid_subject_type allowlist`);
  }
}

if (failed) { console.error("\n[verify-a3] FAILED"); process.exit(1); }
console.log("\n[verify-a3] ALL CHECKS PASSED");
