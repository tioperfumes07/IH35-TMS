#!/usr/bin/env node
// CONN-2 regression guard — keeps the CHAIN-06 §5/§7-A AR-subledger fix from silently regressing.
//
// STATUS 2026-07-21 — CODE FIXED + GUARDS WIRED (verify-steps 920–922); live money path still
// requires owner flag/ops proof. This guard proves the poster wiring remains intact (static analysis).
// Wired via scripts/verify-steps/921-verify-chain-06-ar-subledger-fix.mjs (Rule 17). See
// docs/specs/qbo-parity/CHAIN-06-STATUS-2026-07-21.md and PR #3121.
//
// Background (docs/specs/qbo-parity/CHAIN-06-FACTORING-AR-TIEOUT-PROOF.md §5, surfaced by PR #2188, not
// fixed there by design): postFactoringCustomerPaymentEvent / postFactoringChargebackEvent relieved the
// GL's `ar_control` but never touched `accounting.invoices.amount_paid_cents`/`status` — AR Aging would
// diverge from the GL the moment FACTORING_GL_POSTING_ENABLED flips ON. CONN-2 fixed this by calling a
// deterministic subledger-relief helper right after each event's JE posts (and again as a self-heal on an
// `already_posted` re-entry). This guard is pure static analysis — no DB, no network — mirroring
// verify-factoring-treatment.mjs's pattern, and fails if a future edit removes the wiring.
//
// Also guards the Faro Reserve Tracker write side (accounting.factoring_reserve_movements, migration
// 202607130000): postFactoringAdvanceEvent / postFactoringReleaseEvent must record a reserve movement
// alongside the funding/release JE.

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd());
const POSTER = path.join(ROOT, "apps/backend/src/accounting/factoring-posting/poster.service.ts");

const failures = [];
function fail(msg) {
  failures.push(msg);
}
function read(file) {
  return fs.readFileSync(file, "utf8");
}

// Extract the body of an `export async function <name>(` block up to the next top-level `export ` or EOF.
function extractFn(src, name) {
  const startRe = new RegExp(`export async function ${name}\\b`);
  const m = startRe.exec(src);
  if (!m) return null;
  const rest = src.slice(m.index + m[0].length);
  const nextExport = /\nexport (?:async function|type|const|class)\b/.exec(rest);
  return rest.slice(0, nextExport ? nextExport.index : rest.length);
}

if (!fs.existsSync(POSTER)) {
  fail(`poster not found at ${POSTER}`);
} else {
  const poster = read(POSTER);

  const customerPayment = extractFn(poster, "postFactoringCustomerPaymentEvent");
  if (!customerPayment) {
    fail("could not locate postFactoringCustomerPaymentEvent in poster.service.ts");
  } else {
    if (!/applyCustomerPaymentSubledgerRelief\s*\(/.test(customerPayment)) {
      fail("postFactoringCustomerPaymentEvent no longer calls applyCustomerPaymentSubledgerRelief — the AR subledger (accounting.invoices.amount_paid_cents/status) will silently diverge from the GL again (CHAIN-06 §5/§7-A regression).");
    }
    const postedCount = (customerPayment.match(/applyCustomerPaymentSubledgerRelief\s*\(/g) || []).length;
    if (postedCount < 2) {
      fail(`postFactoringCustomerPaymentEvent calls applyCustomerPaymentSubledgerRelief only ${postedCount} time(s) — expected 2 (once after a fresh JE post, once as an already_posted self-heal). Removing the self-heal call reopens the crash-recovery gap.`);
    }
  }

  const chargeback = extractFn(poster, "postFactoringChargebackEvent");
  if (!chargeback) {
    fail("could not locate postFactoringChargebackEvent in poster.service.ts");
  } else if (!/applyChargebackSubledgerRelief\s*\(/.test(chargeback)) {
    fail("postFactoringChargebackEvent no longer calls applyChargebackSubledgerRelief — a recoursed invoice will stay in the ar_aging sent/partial pool after its receivable left ar_control (CHAIN-06 §5/§7-A regression).");
  }

  const funding = extractFn(poster, "postFactoringAdvanceEvent");
  if (!funding) {
    fail("could not locate postFactoringAdvanceEvent in poster.service.ts");
  } else if (!/recordReserveMovement\s*\(/.test(funding)) {
    fail("postFactoringAdvanceEvent no longer calls recordReserveMovement — the Faro Reserve Tracker will lose the 'held' event for new fundings.");
  }

  const release = extractFn(poster, "postFactoringReleaseEvent");
  if (!release) {
    fail("could not locate postFactoringReleaseEvent in poster.service.ts");
  } else if (!/recordReserveMovement\s*\(/.test(release)) {
    fail("postFactoringReleaseEvent no longer calls recordReserveMovement — the Faro Reserve Tracker will lose the 'released' event.");
  }

  // The relief functions themselves must be deterministic SETs, never increments, so a retry/self-heal
  // call is always safe (no double-count).
  if (/amount_paid_cents\s*=\s*amount_paid_cents\s*\+/.test(poster)) {
    fail("found an INCREMENT-style amount_paid_cents update in poster.service.ts — the subledger relief must be a deterministic SET (idempotent on retry), never an increment.");
  }
}

if (failures.length) {
  console.error(`[verify-chain-06-ar-subledger-fix] FAILED — ${failures.length} issue(s):`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log("[verify-chain-06-ar-subledger-fix] PASS — AR-subledger relief + Faro Reserve Tracker wiring intact.");
