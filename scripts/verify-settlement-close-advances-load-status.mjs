#!/usr/bin/env node
// AUTH-105 CONDITION (Lead ruling, docs/bus/00-LEAD-AUTH-105-STALE-LOAD-STATUS-SYNC.md, 2026-09-28):
// "closing a settlement with a sent invoice must leave the load's status advanced, asserted AT
// CLOSE TIME, not swept up later by a one-shot." verify-settled-load-carries-settled-status.mjs
// already tripwires the LIVE DATA symptom (a load already stuck stale on prod); this guard is the
// complementary STATIC check on the WRITE PATH itself, so a future regression (someone removing
// the sync call while refactoring one of these routes) is caught at push time, before any real row
// ever goes stale again -- the second time in three days this exact gap shipped without one.
//
// ROOT CAUSE (this AUTH's own investigation): settlements.routes.ts's finalize handler DID call
// syncSettlementLoadsToBilling the moment a settlement locks, but that only advances a load whose
// invoice is ALREADY sent at that instant. A load settled BEFORE its invoice is sent -- the
// ordinary case, driver pay and revenue billing running on independent cadences -- had nothing
// left to re-fire the walk once the invoice was later sent: invoice-send.service.ts's
// sendDraftInvoice, and all three issued-status branches in invoices-bulk.routes.ts
// (set_status/mark_sent/mark_factored), flipped the invoice to an issued status and fired the
// revrec latch, but never called the load-billing-lifecycle sync at all. Fixed in the same PR by
// adding syncLoadStatusToBillingInClientTx immediately after each fireRevrecLatchOnInvoiceIssued
// call (same transaction, same guarded pattern every other trigger already uses) -- this guard
// asserts each of those four call sites stays wired, by source text, not by re-deriving a live join.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-settlement-close-advances-load-status";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const CHECKS = [
  {
    file: "apps/backend/src/accounting/invoice-send.service.ts",
    label: "sendDraftInvoice (single-invoice /send path)",
  },
  {
    file: "apps/backend/src/accounting/invoices-bulk.routes.ts",
    label: "invoices-bulk.routes.ts (set_status / mark_sent / mark_factored)",
    minCallCount: 3,
  },
  {
    file: "apps/backend/src/driver-finance/settlements.routes.ts",
    label: "settlement finalize route",
    symbol: "syncSettlementLoadsToBilling",
  },
];

function checkFile({ file, label, minCallCount, symbol }) {
  const abs = path.join(ROOT, file);
  if (!fs.existsSync(abs)) {
    return { file, label, ok: false, reason: "file does not exist" };
  }
  const src = fs.readFileSync(abs, "utf8");
  const needle = symbol ?? "syncLoadStatusToBillingInClientTx";
  const required = minCallCount ?? 1;

  if (symbol) {
    const totalOccurrences = src.split(needle).length - 1;
    // settlements.routes.ts calls the batch wrapper directly; no separate import-line check
    // needed here (it is a named, well-established existing caller, not this AUTH's new wiring).
    const ok = totalOccurrences >= required;
    return { file, label, ok, matches: totalOccurrences, required };
  }

  // Real call syntax only (`needle(`), so a doc-comment mentioning the function's name never
  // inflates the count. Every consumer of the in-tx sync must also import it.
  const hasImport = new RegExp(`import\\s*\\{[^}]*\\b${needle}\\b[^}]*\\}`).test(src);
  const callCount = (src.match(new RegExp(`\\b${needle}\\s*\\(`, "g")) ?? []).length;
  const ok = hasImport && callCount >= required;
  return { file, label, ok, matches: callCount, required, hasImport };
}

function run() {
  const results = CHECKS.map(checkFile);
  const failures = results.filter((r) => !r.ok);
  if (failures.length > 0) {
    console.error(`${LABEL}: FAIL — ${failures.length} write path(s) no longer wire the load-status sync:`);
    for (const f of failures) {
      console.error(`  ✗ ${f.label} (${f.file}): ${f.reason ?? `found ${f.matches ?? 0} call(s), need >= ${f.required}, import present = ${f.hasImport}`}`);
    }
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — all ${results.length} settlement/invoice write paths still wire the load-status sync at close/send time.`);
  for (const r of results) console.log(`  - ${r.label}: ${r.matches ?? "n/a"} call site(s)`);
}

function selftest() {
  const tmpDir = fs.mkdtempSync(path.join(ROOT, ".verify-selftest-"));
  try {
    const good = path.join(tmpDir, "good.ts");
    fs.writeFileSync(
      good,
      `import { syncLoadStatusToBillingInClientTx } from "../dispatch/load-billing-lifecycle.service.js";\nawait syncLoadStatusToBillingInClientTx(client, {});\n`
    );
    const bad = path.join(tmpDir, "bad.ts");
    fs.writeFileSync(bad, `// no sync call here\n`);

    const check = (cond, msg) => {
      if (!cond) {
        console.error(`${LABEL} --selftest FAIL: ${msg}`);
        process.exit(1);
      }
    };
    const relGood = path.relative(ROOT, good);
    const relBad = path.relative(ROOT, bad);
    check(checkFile({ file: relGood, label: "good" }).ok === true, "a file with the import + call must PASS");
    check(checkFile({ file: relBad, label: "bad" }).ok === false, "a file missing the call must FAIL");
    check(checkFile({ file: "no/such/file.ts", label: "missing" }).ok === false, "a missing file must FAIL closed, never a vacuous pass");
    console.log(`${LABEL} --selftest PASS — 3 cases`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

run();
