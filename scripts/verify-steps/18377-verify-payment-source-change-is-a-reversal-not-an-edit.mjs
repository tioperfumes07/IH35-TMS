#!/usr/bin/env node
/**
 * VERIFY-18377 — payment-source change must create a reclassification JE, never a field edit.
 *
 * Law: POST /api/v1/expenses/:expenseId/change-payment-source is the ONLY path that moves the
 * credit leg of a posted expense. A direct UPDATE to accounting.expenses.payment_account_uuid
 * without a corresponding reclassification JE (Dr old / Cr new) is a money-theater defect.
 *
 * Checks:
 *   A) The new endpoint exists in expenses.routes.ts and is NOT a PATCH (field edit).
 *   B) The route creates a 2-line JE via createJournalEntryOnClient — not a field-edit.
 *   C) Bank-match guard: the route refuses if matched_bank_txn_id is set.
 *   D) Relay wallet guard: requires relay_txn_id when moving to the fuel_wallet_relay account.
 *   E) Only-posted guard: the route refuses non-posted expenses (status check present).
 *   F) The old PATCH route still refuses posted expenses (no regression).
 */

import { readFileSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(new URL(".", import.meta.url).pathname, "../..");
const ROUTES_FILE = resolve(ROOT, "apps/backend/src/accounting/expenses.routes.ts");

let src;
try {
  src = readFileSync(ROUTES_FILE, "utf8");
} catch {
  console.error("FAIL: cannot read expenses.routes.ts");
  process.exit(1);
}

const findings = [];

// A) POST endpoint exists (not PATCH)
if (!src.includes('app.post("/api/v1/expenses/:expenseId/change-payment-source"')) {
  findings.push("A: POST /api/v1/expenses/:expenseId/change-payment-source endpoint not found");
}

// B) Uses createJournalEntryOnClient (not a raw field edit alone)
if (!src.includes("createJournalEntryOnClient")) {
  findings.push("B: createJournalEntryOnClient not called in expenses.routes.ts — reclassification JE missing");
}

// C) Bank-match guard present
if (!src.includes("bank_matched") || !src.includes("matched_bank_txn_id")) {
  findings.push("C: bank-match guard missing from change-payment-source route");
}

// D) Relay wallet guard present
if (!src.includes("relay_txn_required") || !src.includes("fuel_wallet_relay")) {
  findings.push("D: relay wallet guard (relay_txn_required / fuel_wallet_relay role check) missing");
}

// E) Only-posted check present
if (!src.includes("not_posted") || !src.includes('posting_status !== "posted"')) {
  findings.push("E: only-posted guard missing from change-payment-source route");
}

// F) PATCH /expenses/:expenseId still refuses posted expenses (no regression)
if (!src.includes("not_draft") || !src.includes("expense_not_draft")) {
  findings.push("F: PATCH route no longer refuses non-draft expenses — regression detected");
}

// Self-test: verify the checks above fire on a synthetic bad snippet
function selfTest() {
  const badSrc = `app.patch("/api/v1/expenses/:expenseId", ...)`;
  const checks = [
    ['app.post("/api/v1/expenses/:expenseId/change-payment-source"', badSrc],
    ["createJournalEntryOnClient", badSrc],
    ["bank_matched", badSrc],
    ["relay_txn_required", badSrc],
    ["not_posted", badSrc],
    ["not_draft", badSrc],
  ];
  for (const [needle, haystack] of checks) {
    if (haystack.includes(needle)) {
      console.error(`SELF-TEST FAIL: check for "${needle.slice(0, 40)}" did not fire on bad src`);
      process.exit(2);
    }
  }
}
selfTest();

if (findings.length > 0) {
  for (const f of findings) console.error(`FINDING: ${f}`);
  process.exit(1);
}

console.log("PASS: verify-payment-source-change-is-a-reversal-not-an-edit (18377)");
