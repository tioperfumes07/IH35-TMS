#!/usr/bin/env node
/**
 * verify-a5-audit-emit-banking.mjs
 * Assert banking mutations emit spine events via emitBankingSpineEvent calling events.log_event().
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
function fail(msg) { console.error(`[verify-a5] FAIL: ${msg}`); failed = true; }
function pass(msg) { console.log(`[verify-a5] PASS: ${msg}`); }

// 1. Helper must exist and call events.log_event
const helperSrc = read("apps/backend/src/banking/banking-spine-emit.ts");
if (!helperSrc.includes("events.log_event")) fail("banking-spine-emit.ts does not call events.log_event()");
else pass("banking-spine-emit.ts calls events.log_event()");

if (/INSERT\s+INTO\s+events\.event_log/i.test(helperSrc)) fail("banking-spine-emit.ts bypasses log_event() with raw INSERT");
else pass("banking-spine-emit.ts does not bypass log_event()");

// 2. Per-file event coverage
const checks = [
  {
    file: "apps/backend/src/banking/transfers.routes.ts",
    events: ["banking.transfer.created", "banking.cc_payment.created", "banking.transfer.revoked"],
  },
  {
    file: "apps/backend/src/banking/categorization.routes.ts",
    events: ["banking.transaction.categorized", "banking.transaction.skipped", "banking.transaction.investigate_flagged"],
  },
  {
    file: "apps/backend/src/banking/reconciliation.routes.ts",
    events: ["banking.reconciliation.started", "banking.reconciliation.completed"],
  },
  // banking/manual-je.routes.ts — ARCHIVED 2026-06-24 (Tier-1 H-1). The route is RETIRED (unmounted; the
  // original is preserved in manual-je.routes.deprecated.ts) and no longer mutates anything, so it is no longer
  // a banking write surface that must emit a spine event. Removed from coverage. Canonical JE path =
  // /api/v1/accounting/journal-entries (which emits via the accounting layer).
];

for (const { file, events } of checks) {
  const src = read(file);
  const shortName = path.basename(file);
  if (!src.includes("emitBankingSpineEvent")) {
    fail(`${shortName}: missing emitBankingSpineEvent import/call`);
    continue;
  }
  pass(`${shortName}: imports emitBankingSpineEvent`);
  for (const ev of events) {
    if (!src.includes(`"${ev}"`)) fail(`${shortName}: missing emit for "${ev}"`);
    else pass(`${shortName}: emits "${ev}"`);
  }
}

// 3. Union must cover all expected types
const allEvents = [
  "banking.transfer.created",
  "banking.cc_payment.created",
  "banking.transfer.revoked",
  "banking.transaction.categorized",
  "banking.transaction.skipped",
  "banking.transaction.investigate_flagged",
  "banking.reconciliation.started",
  "banking.reconciliation.completed",
  "banking.manual_je.created",
];
for (const ev of allEvents) {
  if (!helperSrc.includes(`"${ev}"`)) fail(`BankingSpineEvent union missing "${ev}"`);
  else pass(`BankingSpineEvent union includes "${ev}"`);
}

if (failed) { console.error("\n[verify-a5] FAILED"); process.exit(1); }
console.log("\n[verify-a5] ALL CHECKS PASSED");
