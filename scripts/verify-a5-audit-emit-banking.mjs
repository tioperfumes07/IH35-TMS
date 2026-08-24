#!/usr/bin/env node
/**
 * verify-a5-audit-emit-banking.mjs
 * Assert banking mutations emit spine events via emitBankingSpineEvent calling events.log_event().
 *
 * 2026-07 (audit-spine-emit-silent-failures): every BankingSpineEvent value previously carried a
 * redundant "banking." prefix (two dots), unconditionally violating events.event_log's
 * `valid_event_type` CHECK (`^[a-z]+\.[a-z_]+$` — exactly one dot, letters-only noun before it) on
 * every emit. Fixed to single-dot noun.action form. This guard now (a) checks for the CORRECTED
 * strings so the fix can't be silently reverted, and (b) regex-validates every union member against
 * the exact CHECK pattern so a future addition can't reintroduce a two-dot or underscore-before-dot
 * event_type.
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
    events: ["transfer.created", "ccpayment.created", "transfer.revoked"],
  },
  {
    file: "apps/backend/src/banking/categorization.routes.ts",
    events: ["transaction.categorized", "transaction.skipped", "transaction.investigate_flagged"],
  },
  {
    file: "apps/backend/src/banking/reconciliation.routes.ts",
    events: ["reconciliation.started", "reconciliation.completed"],
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
  "transfer.created",
  "ccpayment.created",
  "transfer.revoked",
  "transaction.categorized",
  "transaction.skipped",
  "transaction.investigate_flagged",
  "reconciliation.started",
  "reconciliation.completed",
  "manualje.created",
];
for (const ev of allEvents) {
  if (!helperSrc.includes(`"${ev}"`)) fail(`BankingSpineEvent union missing "${ev}"`);
  else pass(`BankingSpineEvent union includes "${ev}"`);
}

// 4. Regression guard: every declared BankingSpineEvent literal must satisfy events.event_log's
// `valid_event_type` CHECK constraint exactly (db/migrations/202606111050_w1a_event_log_spine.sql).
// A two-dot string (redundant domain prefix) or an underscore before the dot would violate this and
// silently fail every emit again — catch it here, statically, before it ships.
const VALID_EVENT_TYPE = /^[a-z]+\.[a-z_]+$/;
const unionBlockMatch = helperSrc.match(/export type BankingSpineEvent =([\s\S]*?);/);
if (!unionBlockMatch) {
  fail("could not locate BankingSpineEvent union block to regex-validate");
} else {
  const literals = [...unionBlockMatch[1].matchAll(/\|\s*"([^"]+)"/g)].map((m) => m[1]);
  if (literals.length === 0) fail("BankingSpineEvent union block had no string literals");
  for (const lit of literals) {
    if (!VALID_EVENT_TYPE.test(lit)) fail(`BankingSpineEvent "${lit}" violates events.event_log valid_event_type CHECK (^[a-z]+\\.[a-z_]+$)`);
    else pass(`BankingSpineEvent "${lit}" satisfies valid_event_type CHECK`);
  }
}

// 5. Fire-and-forget `void withCompanyScope(emitBankingSpineEvent)` drops spine rows after
// the mutation already committed (same class as ACCT-F6410). Mutations must await the emit.
const BANKING_MUTATION_FILES = checks.map((c) => c.file);
const FIRE_FORGET_RE = /void\s+withCompanyScope\([\s\S]{0,500}?emitBankingSpineEvent/;
for (const file of BANKING_MUTATION_FILES) {
  const src = read(file);
  if (FIRE_FORGET_RE.test(src)) fail(`${path.basename(file)}: fire-and-forget void withCompanyScope(emitBankingSpineEvent) — await the emit`);
  else pass(`${path.basename(file)}: spine emit is not fire-and-forget`);
}

if (process.argv.includes("--selftest")) {
  const planted = `void withCompanyScope(user.uuid, companyId, (client) => emitBankingSpineEvent(client, { event_type: "transaction.categorized" }))`;
  if (!FIRE_FORGET_RE.test(planted)) {
    console.error("[verify-a5] SELFTEST FAIL: planted fire-and-forget did not match");
    process.exit(1);
  }
}

if (failed) { console.error("\n[verify-a5] FAILED"); process.exit(1); }
console.log("\n[verify-a5] ALL CHECKS PASSED");
