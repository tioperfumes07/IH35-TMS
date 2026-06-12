#!/usr/bin/env node
/**
 * verify-a2-audit-emit-dispatch.mjs
 * Assert that every mutating dispatch handler emits a spine event via emitDispatchSpineEvent,
 * and that the helper itself calls events.log_event().
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const DISPATCH_SRC = path.join(ROOT, "apps/backend/src/dispatch");

function read(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) { console.error(`FAIL: missing file: ${rel}`); process.exit(1); }
  return fs.readFileSync(abs, "utf8");
}

let failed = false;
function fail(msg) { console.error(`[verify-a2] FAIL: ${msg}`); failed = true; }
function pass(msg) { console.log(`[verify-a2] PASS: ${msg}`); }

// 1. Helper must exist and call events.log_event
const helperSrc = read("apps/backend/src/dispatch/dispatch-spine-emit.ts");
if (!helperSrc.includes("events.log_event")) fail("dispatch-spine-emit.ts does not call events.log_event()");
else pass("dispatch-spine-emit.ts calls events.log_event()");

// 2. Helper must NOT bypass the function (no raw INSERT into event_log)
if (/INSERT\s+INTO\s+events\.event_log/i.test(helperSrc)) fail("dispatch-spine-emit.ts bypasses log_event() with raw INSERT");
else pass("dispatch-spine-emit.ts does not bypass log_event()");

// 3. Each mutating file must import and call emitDispatchSpineEvent
const mutatingFiles = [
  { file: "apps/backend/src/dispatch/loads.routes.ts",        events: ["load.created", "load.status_changed", "load.chargeback_flagged"] },
  { file: "apps/backend/src/dispatch/cancellation.routes.ts", events: ["load.cancelled", "load.cancellation_approved"] },
  { file: "apps/backend/src/dispatch/quicksave.routes.ts",    events: ["load.assigned_to_driver", "load.quicksave_draft_completed"] },
];

for (const { file, events } of mutatingFiles) {
  const src = read(file);
  if (!src.includes("emitDispatchSpineEvent")) {
    fail(`${file}: missing emitDispatchSpineEvent import/call`);
    continue;
  }
  pass(`${file}: imports emitDispatchSpineEvent`);
  for (const ev of events) {
    if (!src.includes(ev)) fail(`${file}: missing emit for event type "${ev}"`);
    else pass(`${file}: emits "${ev}"`);
  }
}

// 4. DispatchSpineEvent union must cover all expected types
const expectedTypes = [
  "load.created", "load.status_changed", "load.rate_changed",
  "load.chargeback_flagged", "load.cancelled", "load.cancellation_approved",
  "load.assigned_to_driver", "load.quicksave_draft_completed",
];
for (const t of expectedTypes) {
  if (!helperSrc.includes(`"${t}"`)) fail(`dispatch-spine-emit.ts: DispatchSpineEvent union missing "${t}"`);
  else pass(`DispatchSpineEvent union includes "${t}"`);
}

if (failed) { console.error("\n[verify-a2] FAILED"); process.exit(1); }
console.log("\n[verify-a2] ALL CHECKS PASSED");
