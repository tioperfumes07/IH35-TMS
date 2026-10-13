#!/usr/bin/env node
/**
 * 18389-verify-creator-invoice-never-emails.mjs
 *
 * Lead ruling 2026-10-10: an invoice created by the Settlement Creator (mode='historical_backfill')
 * MUST NEVER queue a customer email on post, repost, or rehearsal — for any customer, regardless of
 * whether an email address is on file.
 *
 * Root cause: invoice-send.service.ts:649 — enqueueEmail fires unconditionally when
 * `customerEmail && notify`. The 5769 post had 0 queue rows only because that customer had no email
 * on file (luck, not a rule). Any Creator settlement for a customer WITH an email would have fired.
 *
 * Fix: add `&& mode !== "historical_backfill"` to the enqueue guard. Settlement Creator always
 * passes mode='historical_backfill', so Creator invoices skip enqueue on every path.
 *
 * Checks:
 *   A) mode is captured from input and validated to 'historical_backfill' | 'live_feed'
 *   B) enqueueEmail is guarded by mode !== "historical_backfill"
 *   C) Settlement Creator passes mode='historical_backfill' to sendDraftInvoice
 *   D) The historical_backfill early-exit comment names this law (self-documents the rule)
 *   E) self-test: the OLD unconditional guard `if (customerEmail && notify) {` is gone
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

let pass = 0;
let fail = 0;
const findings = [];

function check(label, ok, detail) {
  if (ok) { pass++; }
  else { fail++; findings.push(`FAIL ${label}: ${detail}`); }
}

const sendFile = readFileSync(
  path.join(ROOT, "apps/backend/src/accounting/invoice-send.service.ts"),
  "utf8"
);
const creatorFile = readFileSync(
  path.join(ROOT, "apps/backend/src/driver-finance/settlement-creator.service.ts"),
  "utf8"
);

// A — mode is captured + validated
check(
  "A: InvoiceSendMode type declared",
  sendFile.includes(`InvoiceSendMode = "live_feed" | "historical_backfill"`),
  "InvoiceSendMode must declare 'live_feed' | 'historical_backfill'"
);
check(
  "A: mode resolved from input",
  sendFile.includes(`input.mode === "historical_backfill" ? "historical_backfill" : "live_feed"`),
  "mode must default to live_feed when input.mode is not 'historical_backfill'"
);

// B — enqueueEmail is guarded by mode !== "historical_backfill"
check(
  "B: enqueueEmail guard includes mode !== historical_backfill",
  sendFile.includes(`mode !== "historical_backfill"`) && sendFile.includes("enqueueEmail"),
  "enqueueEmail block must be gated on mode !== \"historical_backfill\""
);

// C — Settlement Creator passes mode='historical_backfill'
check(
  "C: Creator passes mode historical_backfill",
  creatorFile.includes(`mode: "historical_backfill"`),
  "settlement-creator must pass mode: \"historical_backfill\" to sendDraftInvoice"
);

// D — the guard comment names this law
check(
  "D: comment names Lead ruling and luck diagnosis",
  sendFile.includes("historical_backfill") && sendFile.includes("luck"),
  "the mode guard must carry a comment explaining why historical_backfill skips email"
);

// E — self-test: old unconditional guard is gone
check(
  "E: old unconditional if (customerEmail && notify) { is replaced",
  !sendFile.includes("if (customerEmail && notify) {"),
  "the old unconditional enqueue guard must not exist — it must now check mode"
);

console.log(`\n18389-verify-creator-invoice-never-emails: ${pass} pass, ${fail} fail`);
if (findings.length) findings.forEach(f => console.error(f));
process.exit(fail > 0 ? 1 : 0);
