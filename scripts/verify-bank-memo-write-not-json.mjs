#!/usr/bin/env node
/**
 * verify-bank-memo-write-not-json.mjs  (ACCT-F6284, write-side root-cause fix)
 *
 * Root cause: several money-write paths stuffed internal audit metadata
 * (`JSON.stringify({source, bank_transaction_id, ...})`) directly into free-text columns —
 * `accounting.bills.memo`, `accounting.bill_payments.memo`, `banking.bank_transactions.notes`,
 * `banking.bank_transactions.categorization_memo` — that readers treat as human display text:
 * BankTransactionAttachmentsNotesModal.tsx renders `{tx.notes}` verbatim, TransfersListPage.tsx
 * inherits categorization_memo as a transfer's memo, and the Accounting hub's "Find Transactions"
 * panel falls back to bill/bill_payment memo. `apps/frontend/src/lib/entity-label.ts`'s
 * `looksLikeSerializedJson()` guard (see verify-entity-label-rejects-serialized-json.mjs) protects
 * the READ side generically; this guard protects the WRITE side at its known source files so the
 * poisoning stops happening instead of just being hidden downstream.
 *
 * Every one of these write sites already had a matching human-readable string sitting right next
 * to it (bill_lines.description, category_kind, etc.) — the fix is a straight swap, not new design.
 *
 * Usage:
 *   node scripts/verify-bank-memo-write-not-json.mjs            # scan
 *   node scripts/verify-bank-memo-write-not-json.mjs --selftest # regression harness -> must FAIL on bug
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();

const FILES = [
  "apps/backend/src/banking/bank-transaction-splits.service.ts",
  "apps/backend/src/banking/bulk-transactions.ts",
  "apps/backend/src/insurance/policy-create-atomic.service.ts",
];

/** Strip `//` line comments so a JSON.stringify( mentioned only in prose doesn't false-positive. */
function stripLineComments(src) {
  return src
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("//");
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join("\n");
}

export function checkFileHasNoJsonStringifyWrite(src, label) {
  const offenders = [];
  const code = stripLineComments(src);
  if (/JSON\.stringify\(/.test(code)) {
    const lineNo = code.slice(0, code.search(/JSON\.stringify\(/)).split("\n").length;
    offenders.push(
      `${label}:${lineNo}: JSON.stringify( call reintroduced — ACCT-F6284 regression. A memo/notes/` +
        `categorization_memo free-text column would render raw serialized JSON to the user again. ` +
        `Use a human sentence; the structured fields are already carried by dedicated columns ` +
        `(source_bank_transaction_id, category_kind, linked_entity_id, qbo_idempotency_key, etc.).`,
    );
  }
  return offenders;
}

function main() {
  const selftest = process.argv.includes("--selftest");

  if (selftest) {
    const clean = "const memo = `human text ${x}`;\n// JSON.stringify( in a comment is fine\n";
    const bugged = "const memo = JSON.stringify({ source: 'x', id });\n";
    const cleanOffenders = checkFileHasNoJsonStringifyWrite(clean, "fixture");
    const buggedOffenders = checkFileHasNoJsonStringifyWrite(bugged, "fixture");
    if (cleanOffenders.length !== 0) {
      console.error("SELFTEST FAIL: clean fixture flagged", cleanOffenders);
      process.exit(1);
    }
    if (buggedOffenders.length === 0) {
      console.error("SELFTEST FAIL: bugged fixture NOT flagged — mutation escaped");
      process.exit(1);
    }
    console.log("verify-bank-memo-write-not-json --selftest PASS");
    process.exit(0);
  }

  const offenders = [];
  for (const rel of FILES) {
    const abs = path.join(repoRoot, rel);
    if (!fs.existsSync(abs)) {
      offenders.push(`${rel}: file not found`);
      continue;
    }
    const src = fs.readFileSync(abs, "utf8");
    offenders.push(...checkFileHasNoJsonStringifyWrite(src, rel));
  }

  if (offenders.length > 0) {
    console.error("[verify-bank-memo-write-not-json] FAILED:");
    for (const o of offenders) console.error(`  ✗ ${o}`);
    process.exit(1);
  }
  console.log("[verify-bank-memo-write-not-json] PASSED — no JSON.stringify() writes into memo/notes columns");
  process.exit(0);
}

main();
