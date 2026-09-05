#!/usr/bin/env node
// ACCT-SETL-DEDUCTION-VOID-DESIGN — OWNER RULING 2026-09-05 19:44Z ("why would I forgive the
// debt"): a void of a driver_finance.driver_settlement_deductions row NEVER forgives, refunds, or
// writes off the debt — it only changes WHEN/HOW an amount is collected, never WHETHER. The
// earlier design (still live before this fix) posted a reversing JE crediting the driver back via
// A/P control for a fully-APPLIED (100% collected) deduction — that IS a refund.
//
// Source check only — proves the service that implements the void:
//   1. Never imports/calls createJournalEntryOnClient (the only way this file could move money) —
//      the strongest possible guarantee that NO branch, present or future, can refund.
//   2. The applied-status branch is record-only: sets voided_at with no void_reversal_entry_id,
//      and its outcome type says "retained", not "reversed".
//
// Run: node scripts/verify-deduction-void-never-forgives.mjs [--selftest]
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-deduction-void-never-forgives";
const FILE = "apps/backend/src/driver-finance/settlement-deduction-void.service.ts";

function loadSource(rel) {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

export function collectSourceFailures(source = loadSource(FILE)) {
  const failures = [];
  if (/createJournalEntryOnClient/.test(source)) {
    failures.push("settlement-deduction-void.service.ts still references createJournalEntryOnClient — a void must never be able to post a reversing/refunding JE");
  }
  if (!/status === "applied"/.test(source)) {
    failures.push("no applied-status branch found");
  }
  if (!/outcome: "voided_applied_retained"/.test(source)) {
    failures.push("applied branch does not return the record-only 'voided_applied_retained' outcome");
  }
  if (/void_reversal_entry_id\s*=/.test(source)) {
    failures.push("void_reversal_entry_id is still written — no branch may record a reversing entry");
  }
  if (!/reversed_cents:\s*0/.test(source)) {
    failures.push("applied branch does not report reversed_cents: 0 (a real reversal must never happen)");
  }
  return failures;
}

function selftest() {
  const good = loadSource(FILE);
  if (collectSourceFailures(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — good source rejected`);
    process.exit(1);
  }
  const withJe = good.replace(
    'import type { QueryableClient } from "../accounting/journal-entries.service.js";',
    'import { createJournalEntryOnClient, type QueryableClient } from "../accounting/journal-entries.service.js";'
  );
  const withReversalColumn = good.replace(
    "outcome: \"voided_applied_retained\",",
    "outcome: \"voided_applied_retained\", void_reversal_entry_id = 'x',"
  );
  for (const [name, plant] of [
    ["JE import reintroduced", withJe],
    ["void_reversal_entry_id write reintroduced", withReversalColumn],
  ]) {
    if (collectSourceFailures(plant).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name} was not caught`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST OK — 2/2 plants rejected`);
}

if (process.argv.includes("--selftest")) selftest();

const failures = collectSourceFailures();
if (failures.length) {
  console.error(`${LABEL}: FAIL`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — deduction void can never post a reversing JE; applied-status void is record-only, debt is never forgiven`);
