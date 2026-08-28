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
  { file: "apps/backend/src/dispatch/loads.routes.ts",        events: ["load.status_changed", "load.chargeback_flagged"] },
  { file: "apps/backend/src/dispatch/book-load.service.ts",   events: ["load.created"] },
  { file: "apps/backend/src/dispatch/cancellation.routes.ts", events: ["load.cancelled", "load.cancellation_approved"] },
  { file: "apps/backend/src/dispatch/quick-assign.service.ts", events: ["load.assigned_to_driver", "load.quicksave_draft_completed"] },
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

// 3b. Presence is not enough: Quick Assign used to commit first and then launch both emits as
// detached, swallowed route callbacks. Require awaited emits inside the service transaction and
// prohibit route-level copies, which would restore the partial-success window.
const quickAssignSrc = read("apps/backend/src/dispatch/quick-assign.service.ts");
const quicksaveRouteSrc = read("apps/backend/src/dispatch/quicksave.routes.ts");
function quickAssignAtomicityFailures(serviceSrc, routeSrc) {
  const failures = [];
  for (const eventType of ["load.assigned_to_driver", "load.quicksave_draft_completed"]) {
    const awaitedEvent = new RegExp(
      `await\\s+emitDispatchSpineEvent\\(client,[\\s\\S]{0,500}?event_type:\\s*["']${eventType.replaceAll(".", "\\.")}["']`,
    );
    if (!awaitedEvent.test(serviceSrc)) failures.push(`${eventType} not awaited in service transaction`);
  }
  if (/emitDispatchSpineEvent|spine_emit_load_(?:assigned_to_driver|quicksave_draft_completed)_failed/.test(routeSrc)) {
    failures.push("route contains detached/swallowed spine emit");
  }
  return failures;
}

function bookLoadAtomicityFailures(serviceSrc, routeSrc) {
  const failures = [];
  if (!/await\s+emitDispatchSpineEvent\(client,[\s\S]{0,500}?event_type:\s*["']load\.created["']/.test(serviceSrc)) {
    failures.push("load.created not awaited in bookLoad transaction");
  }
  if (/spine_emit_load_created_failed/.test(routeSrc)) failures.push("route swallows detached load.created emit");
  return failures;
}

const atomicityFailures = quickAssignAtomicityFailures(quickAssignSrc, quicksaveRouteSrc);
if (atomicityFailures.length > 0) {
  for (const message of atomicityFailures) fail(`quick-assign atomicity: ${message}`);
} else {
  pass("quick-assign + draft-complete spine events are awaited in-transaction; route has no detached copy");
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    {
      name: "assignment emit loses await",
      service: quickAssignSrc.replace(
        /await emitDispatchSpineEvent\(client, \{([\s\S]{0,300}?event_type: "load\.assigned_to_driver")/,
        "void emitDispatchSpineEvent(client, {$1",
      ),
      route: quicksaveRouteSrc,
    },
    {
      name: "draft-complete emit loses await",
      service: quickAssignSrc.replace(
        /await emitDispatchSpineEvent\(client, \{([\s\S]{0,300}?event_type: "load\.quicksave_draft_completed")/,
        "emitDispatchSpineEvent(client, {$1",
      ),
      route: quicksaveRouteSrc,
    },
    {
      name: "route restores swallowed post-commit emit",
      service: quickAssignSrc,
      route: `${quicksaveRouteSrc}\nvoid emitDispatchSpineEvent(client, {}).catch(() => undefined);`,
    },
  ];
  let caught = 0;
  for (const mutation of mutations) {
    if (quickAssignAtomicityFailures(mutation.service, mutation.route).length > 0) {
      console.log(`[verify-a2] SELFTEST PASS: ${mutation.name}`);
      caught += 1;
    } else {
      fail(`SELFTEST mutation survived: ${mutation.name}`);
    }
  }
  if (caught === mutations.length) pass(`SELFTEST caught ${caught}/${mutations.length} planted regressions`);

  const bookLoadSrc = read("apps/backend/src/dispatch/book-load.service.ts");
  const loadsRouteSrc = read("apps/backend/src/dispatch/loads.routes.ts");
  const bookMutations = [
    {
      name: "book-load create emit loses await",
      service: bookLoadSrc.replace(
        /await emitDispatchSpineEvent\(client, \{([\s\S]{0,300}?event_type: "load\.created")/,
        "void emitDispatchSpineEvent(client, {$1",
      ),
      route: loadsRouteSrc,
    },
    {
      name: "load route restores swallowed post-commit create emit",
      service: bookLoadSrc,
      route: `${loadsRouteSrc}\nreq.log.warn({}, "spine_emit_load_created_failed");`,
    },
  ];
  let bookCaught = 0;
  for (const mutation of bookMutations) {
    if (bookLoadAtomicityFailures(mutation.service, mutation.route).length > 0) {
      console.log(`[verify-a2] SELFTEST PASS: ${mutation.name}`);
      bookCaught += 1;
    } else {
      fail(`SELFTEST mutation survived: ${mutation.name}`);
    }
  }
  if (bookCaught === bookMutations.length) pass(`SELFTEST caught ${bookCaught}/${bookMutations.length} book-load regressions`);
}

const bookLoadFailures = bookLoadAtomicityFailures(
  read("apps/backend/src/dispatch/book-load.service.ts"),
  read("apps/backend/src/dispatch/loads.routes.ts"),
);
if (bookLoadFailures.length > 0) {
  for (const message of bookLoadFailures) fail(`book-load atomicity: ${message}`);
} else {
  pass("book-load load.created spine event is awaited in-transaction; route has no swallowed copy");
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
