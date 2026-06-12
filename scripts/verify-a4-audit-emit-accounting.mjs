#!/usr/bin/env node
/**
 * verify-a4-audit-emit-accounting.mjs
 * Assert that accounting mutations emit spine events via emitAccountingSpineEvent calling events.log_event().
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
  { file: "apps/backend/src/accounting/bills.routes.ts", events: ["bill.created", "bill.paid", "bill.voided", "bill_payment.voided"] },
  { file: "apps/backend/src/accounting/expenses.routes.ts", events: ["expense.created", "expense.reattributed"] },
  { file: "apps/backend/src/accounting/payments.routes.ts", events: ["payment.created", "payment.voided"] },
  { file: "apps/backend/src/accounting/customer-payments.routes.ts", events: ["customer_payment.created"] },
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
  "bill.created", "bill.paid", "bill.voided", "bill_payment.voided", "bill.allocated",
  "expense.created", "expense.reattributed",
  "payment.created", "payment.voided",
  "customer_payment.created",
];
for (const ev of allEvents) {
  if (!helperSrc.includes(`"${ev}"`)) fail(`AccountingSpineEvent union missing "${ev}"`);
  else pass(`AccountingSpineEvent union includes "${ev}"`);
}

if (failed) { console.error("\n[verify-a4] FAILED"); process.exit(1); }
console.log("\n[verify-a4] ALL CHECKS PASSED");
