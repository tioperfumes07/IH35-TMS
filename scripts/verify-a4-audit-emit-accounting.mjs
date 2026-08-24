#!/usr/bin/env node
/**
 * verify-a4-audit-emit-accounting.mjs
 * Assert that accounting mutations emit spine events via emitAccountingSpineEvent calling events.log_event().
 *
 * 2026-07 (audit-spine-emit-silent-failures): "bill_payment.voided" / "customer_payment.created" had
 * an underscore BEFORE the dot, violating the letters-only-noun half of events.event_log's
 * `valid_event_type` CHECK (`^[a-z]+\.[a-z_]+$`) on every emit — same root cause as the banking fix
 * in this PR, found alongside it. Renamed to "payment.bill_voided" / "payment.customer_created".
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
function fail(msg) { console.error(`[verify-a4] FAIL: ${msg}`); failed = true; }
function pass(msg) { console.log(`[verify-a4] PASS: ${msg}`); }

// 1. Helper must exist and call events.log_event
const helperSrc = read("apps/backend/src/accounting/accounting-spine-emit.ts");
if (!helperSrc.includes("events.log_event")) fail("accounting-spine-emit.ts does not call events.log_event()");
else pass("accounting-spine-emit.ts calls events.log_event()");

if (/INSERT\s+INTO\s+events\.event_log/i.test(helperSrc)) fail("accounting-spine-emit.ts bypasses log_event() with raw INSERT");
else pass("accounting-spine-emit.ts does not bypass log_event()");

// 2. Per-file event coverage
const checks = [
  { file: "apps/backend/src/accounting/invoices.routes.ts", events: ["invoice.created", "invoice.updated", "invoice.sent", "invoice.voided"] },
  { file: "apps/backend/src/accounting/bills.routes.ts", events: ["bill.created", "bill.paid", "bill.voided", "payment.bill_voided"] },
  { file: "apps/backend/src/accounting/expenses.routes.ts", events: ["expense.created", "expense.reattributed"] },
  { file: "apps/backend/src/accounting/payments.routes.ts", events: ["payment.created", "payment.voided"] },
  { file: "apps/backend/src/accounting/customer-payments.routes.ts", events: ["payment.customer_created"] },
];

for (const { file, events } of checks) {
  const src = read(file);
  const shortName = path.basename(file);
  if (!src.includes("emitAccountingSpineEvent")) {
    fail(`${shortName}: missing emitAccountingSpineEvent import/call`);
    continue;
  }
  pass(`${shortName}: imports emitAccountingSpineEvent`);
  for (const ev of events) {
    if (!src.includes(`"${ev}"`)) fail(`${shortName}: missing emit for "${ev}"`);
    else pass(`${shortName}: emits "${ev}"`);
  }
}

// 3. Union must cover all expected types
const allEvents = [
  "invoice.created", "invoice.updated", "invoice.sent", "invoice.voided",
  "bill.created", "bill.paid", "bill.voided", "payment.bill_voided", "bill.allocated",
  "expense.created", "expense.reattributed",
  "payment.created", "payment.voided",
  "payment.customer_created",
];
for (const ev of allEvents) {
  if (!helperSrc.includes(`"${ev}"`)) fail(`AccountingSpineEvent union missing "${ev}"`);
  else pass(`AccountingSpineEvent union includes "${ev}"`);
}

// 4. Regression guard: every declared AccountingSpineEvent literal must satisfy events.event_log's
// `valid_event_type` CHECK exactly (db/migrations/202606111050_w1a_event_log_spine.sql) so an
// underscore-before-the-dot (or any other CHECK violation) can't be silently reintroduced.
const VALID_EVENT_TYPE = /^[a-z]+\.[a-z_]+$/;
const unionBlockMatch = helperSrc.match(/export type AccountingSpineEvent =([\s\S]*?);/);
if (!unionBlockMatch) {
  fail("could not locate AccountingSpineEvent union block to regex-validate");
} else {
  const literals = [...unionBlockMatch[1].matchAll(/\|\s*"([^"]+)"/g)].map((m) => m[1]);
  if (literals.length === 0) fail("AccountingSpineEvent union block had no string literals");
  for (const lit of literals) {
    if (!VALID_EVENT_TYPE.test(lit)) fail(`AccountingSpineEvent "${lit}" violates events.event_log valid_event_type CHECK (^[a-z]+\\.[a-z_]+$)`);
    else pass(`AccountingSpineEvent "${lit}" satisfies valid_event_type CHECK`);
  }
}

// 5. Fire-and-forget `void withCompanyScope(emitAccountingSpineEvent)` drops spine rows after
// money already committed. Mutations must await the emit (same txn when already in scope).
const ACCOUNTING_MUTATION_FILES = checks.map((c) => c.file);
const FIRE_FORGET_RE = /void\s+withCompanyScope\([\s\S]{0,500}?emitAccountingSpineEvent/;
for (const file of ACCOUNTING_MUTATION_FILES) {
  const src = read(file);
  if (FIRE_FORGET_RE.test(src)) fail(`${path.basename(file)}: fire-and-forget void withCompanyScope(emitAccountingSpineEvent) — await the emit`);
  else pass(`${path.basename(file)}: spine emit is not fire-and-forget`);
}

if (process.argv.includes("--selftest")) {
  const planted = `void withCompanyScope(user.uuid, companyId, (client) => emitAccountingSpineEvent(client, { event_type: "invoice.voided" }))`;
  if (!FIRE_FORGET_RE.test(planted)) {
    console.error("[verify-a4] SELFTEST FAIL: planted fire-and-forget did not match");
    process.exit(1);
  }
}

if (failed) { console.error("\n[verify-a4] FAILED"); process.exit(1); }
console.log("\n[verify-a4] ALL CHECKS PASSED");
