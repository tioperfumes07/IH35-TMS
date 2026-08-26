#!/usr/bin/env node
// BILL-NUMBER-FALSE-NOT-VISIBLE — guard
//
// `bill_number` is a genuinely user-OPTIONAL field on accounting.bills (the vendor's own invoice
// number, entered by a human at bill-create time — see bills.service.ts: `const billNumber =
// input.billNumber?.trim();`). It is never a foreign-key-resolved name, so a blank bill_number on
// a bill we already have in hand is NOT the "RLS-masked / entity-scoped join found nothing"
// condition entityLabel() exists to report — the row IS visible, we're looking straight at it.
//
// Every prior call site used `entityLabel(x.bill_number, x.id, "Bill")`, whose fallback for a
// blank bill_number is the sentence "Bill — not visible" (see apps/frontend/src/lib/entity-label.ts
// docstring: "an id, no name -> '<noun> — not visible' ... usually means an entity-scoped join
// found nothing"). Live-reproduced 2026-08-26: a real, fully-postable, $110 open bill for LOVES
// TRAVEL STOPS (real JE, real WO link, real GL lines) rendered as "Bill — not visible" on both its
// own detail-page title and the Vendors master-detail transaction list, purely because the vendor
// never typed an invoice number — reads exactly like an access/masking failure when it is neither.
//
// The codebase already has the correct helper for this: `visibleDocumentLabel()` — "Visible
// list/register/audit row: never claim the document is 'not visible' while showing it." This guard
// fails if any `entityLabel(..., "bill_number field", ...)` call site reappears anywhere under
// apps/frontend/src — the fix is a straight swap to `visibleDocumentLabel`, never a re-introduction
// of the RLS-tombstone phrasing for this always-user-optional field.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const SRC_DIR = path.join(root, "apps/frontend/src");

// Matches entityLabel( immediately followed by an expression referencing a *bill_number field —
// the exact anti-pattern this guard exists to catch. visibleDocumentLabel(...bill_number...) is
// fine and expected; only a bare entityLabel( call on a bill_number field is a regression.
const OFFENDER_RE = /entityLabel\(\s*[a-zA-Z_][a-zA-Z0-9_]*\.(?:paid_|matched_)?bill_number\b/;

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (/\.(tsx|ts)$/.test(entry.name) && !entry.name.endsWith(".test.tsx") && !entry.name.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

export function checkText(text, relPath) {
  const failures = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (OFFENDER_RE.test(line)) {
      failures.push(`${relPath}:${i + 1}: entityLabel(...bill_number...) — use visibleDocumentLabel() instead: ${line.trim()}`);
    }
  });
  return failures;
}

function run() {
  const files = walk(SRC_DIR, []);
  const failures = [];
  for (const full of files) {
    const rel = path.relative(root, full);
    const text = fs.readFileSync(full, "utf8");
    failures.push(...checkText(text, rel));
  }
  if (failures.length > 0) {
    console.error("FAIL: bill-number-uses-visible-document-label");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: no entityLabel(...bill_number...) call sites remain — all use visibleDocumentLabel()");
}

function selftest() {
  const offender = `label={entityLabel(bill.bill_number, bill.id, "Bill")}`;
  const failures = checkText(offender, "synthetic-offender.tsx");
  if (failures.length === 0) {
    console.error("FAIL(selftest): planted offender (entityLabel on bill_number) was NOT caught");
    process.exit(1);
  }
  console.log("PASS(selftest): planted offender correctly caught");

  const clean = `label={visibleDocumentLabel(bill.bill_number, bill.id, "Bill")}`;
  const cleanFailures = checkText(clean, "synthetic-clean.tsx");
  if (cleanFailures.length > 0) {
    console.error("FAIL(selftest): visibleDocumentLabel(...bill_number...) was WRONGLY flagged");
    process.exit(1);
  }
  console.log("PASS(selftest): visibleDocumentLabel(...bill_number...) correctly NOT flagged");

  // Run the real scan too, to prove the actual repo is currently clean.
  const files = walk(SRC_DIR, []);
  let realFailures = [];
  for (const full of files) {
    const rel = path.relative(root, full);
    realFailures.push(...checkText(fs.readFileSync(full, "utf8"), rel));
  }
  if (realFailures.length > 0) {
    console.error("FAIL(selftest): the real repo currently has offenders:");
    for (const f of realFailures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`PASS(selftest): real repo scan clean (0 offenders across ${files.length} files)`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
