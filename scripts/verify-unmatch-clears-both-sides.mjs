#!/usr/bin/env node
/**
 * BNK-11 (ACC-20, 2026-09-07) — unmatchBankTransaction() only cleared 6 of the 8 matched_*_id
 * columns acceptMatchWithResolveDifference() can actually set (MATCHED_COLUMN_BY_KIND includes
 * 'payment' -> matched_payment_id and 'bill_payment' -> matched_bill_payment_id). Unmatching a bank
 * line that had been matched to a payment or bill payment left it permanently linked
 * (matched_payment_id / matched_bill_payment_id never cleared) even though review_state correctly
 * reset to 'for_review' — a bank line simultaneously "back in the queue" and "still linked". The
 * ledger side's own reverse pointer (accounting.payments.source_bank_transaction_id,
 * accounting.bill_payments.source_bank_transaction_id / from_bank_account_id) was never cleared
 * either, so the payment/bill_payment row kept pointing at a bank transaction that no longer
 * considered itself matched to it.
 *
 * This guard asserts unmatchBankTransaction():
 *   1. Clears ALL EIGHT matched_*_id columns (not just the original six).
 *   2. Clears accounting.payments.source_bank_transaction_id when it points at this bank txn.
 *   3. Clears accounting.bill_payments.source_bank_transaction_id / from_bank_account_id likewise.
 *   4. Both ledger-side clears are scoped ("AND source_bank_transaction_id = $3::uuid" / the bank
 *      transaction id) so a link that has since moved on to a different bank line is never touched.
 *   5. 'payment' and 'bill_payment' are included in the rejectedKinds list (previously only
 *      expense/transfer/je/bill were, silently skipping two of the six real LedgerEntryKind values).
 *
 * Run:
 *   node scripts/verify-unmatch-clears-both-sides.mjs --selftest   (no DB, source-only checks)
 *   node scripts/verify-unmatch-clears-both-sides.mjs              (asserts against the real file)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-unmatch-clears-both-sides";
const TARGET = path.join(ROOT, "apps/backend/src/accounting/bank-recon/recon-worklist.service.ts");

const ALL_EIGHT_COLUMNS = [
  "matched_expense_id",
  "matched_transfer_id",
  "matched_journal_entry_id",
  "matched_load_id",
  "matched_bill_id",
  "matched_settlement_id",
  "matched_payment_id",
  "matched_bill_payment_id",
];

export function checkUnmatchClearsBothSides(source) {
  const failures = [];

  const fnMarker = /export async function unmatchBankTransaction/;
  const fnMatch = fnMarker.exec(source);
  if (!fnMatch) {
    failures.push("unmatchBankTransaction() not found — guard assumption changed, review.");
    return failures;
  }
  // Isolate the function body from its start to the next top-level `export async function` (or EOF).
  const rest = source.slice(fnMatch.index + fnMatch[0].length);
  const nextFnIdx = rest.search(/\nexport async function /);
  const body = nextFnIdx === -1 ? rest : rest.slice(0, nextFnIdx);

  for (const col of ALL_EIGHT_COLUMNS) {
    const setRe = new RegExp(`${col}\\s*=\\s*NULL`);
    if (!setRe.test(body)) {
      failures.push(`unmatchBankTransaction does not clear ${col} — a bank line unmatched from this kind stays permanently linked.`);
    }
  }

  if (!/UPDATE accounting\.payments[\s\S]{0,200}source_bank_transaction_id\s*=\s*NULL[\s\S]{0,300}source_bank_transaction_id\s*=\s*\$3::uuid/.test(body)) {
    failures.push(
      "unmatchBankTransaction does not clear accounting.payments.source_bank_transaction_id (scoped to " +
        "the unmatched bank transaction) — the ledger-side reverse pointer stays orphaned."
    );
  }
  if (!/UPDATE accounting\.bill_payments[\s\S]{0,300}source_bank_transaction_id\s*=\s*NULL[\s\S]{0,100}from_bank_account_id\s*=\s*NULL[\s\S]{0,300}source_bank_transaction_id\s*=\s*\$3::uuid/.test(body)) {
    failures.push(
      "unmatchBankTransaction does not clear accounting.bill_payments.source_bank_transaction_id / " +
        "from_bank_account_id (scoped to the unmatched bank transaction) — the ledger-side reverse " +
        "pointer stays orphaned."
    );
  }

  if (!/rejectedKinds\.push\(\{\s*kind:\s*"payment"/.test(body)) {
    failures.push("rejectedKinds never includes 'payment' — an unmatched payment-kind match is never recorded as rejected.");
  }
  if (!/rejectedKinds\.push\(\{\s*kind:\s*"bill_payment"/.test(body)) {
    failures.push("rejectedKinds never includes 'bill_payment' — an unmatched bill_payment-kind match is never recorded as rejected.");
  }

  return failures;
}

function main() {
  if (process.argv.includes("--selftest")) {
    const good = `
      export async function unmatchBankTransaction(input) {
        return withLuciaBypass(async (client) => {
          const res = await client.query(\`
            UPDATE banking.bank_transactions bt
            SET matched_expense_id = NULL,
                matched_transfer_id = NULL,
                matched_journal_entry_id = NULL,
                matched_load_id = NULL,
                matched_bill_id = NULL,
                matched_settlement_id = NULL,
                matched_payment_id = NULL,
                matched_bill_payment_id = NULL
            RETURNING bt.id
          \`);
          if (row.prev_payment_id) {
            await client.query(\`UPDATE accounting.payments
                SET source_bank_transaction_id = NULL
              WHERE id = $1::uuid AND operating_company_id = $2::uuid
                AND source_bank_transaction_id = $3::uuid\`);
          }
          if (row.prev_bill_payment_id) {
            await client.query(\`UPDATE accounting.bill_payments
                SET source_bank_transaction_id = NULL,
                    from_bank_account_id = NULL
              WHERE id = $1::uuid AND operating_company_id = $2::uuid
                AND source_bank_transaction_id = $3::uuid\`);
          }
          const rejectedKinds = [];
          rejectedKinds.push({ kind: "payment", id: row.prev_payment_id });
          rejectedKinds.push({ kind: "bill_payment", id: row.prev_bill_payment_id });
        });
      }
      export async function nextFn() {}
    `;
    const bad = `
      export async function unmatchBankTransaction(input) {
        return withLuciaBypass(async (client) => {
          const res = await client.query(\`
            UPDATE banking.bank_transactions bt
            SET matched_expense_id = NULL,
                matched_transfer_id = NULL,
                matched_journal_entry_id = NULL,
                matched_load_id = NULL,
                matched_bill_id = NULL,
                matched_settlement_id = NULL
            RETURNING bt.id
          \`);
          const rejectedKinds = [];
          rejectedKinds.push({ kind: "expense", id: row.prev_expense_id });
        });
      }
      export async function nextFn() {}
    `;
    const goodFailures = checkUnmatchClearsBothSides(good);
    const badFailures = checkUnmatchClearsBothSides(bad);
    if (goodFailures.length !== 0) {
      console.error(`[${LABEL}] SELFTEST FAILED: expected good fixture to pass, got`, goodFailures);
      process.exit(1);
    }
    if (badFailures.length === 0) {
      console.error(`[${LABEL}] SELFTEST FAILED: expected bad fixture to fail, got none`);
      process.exit(1);
    }
    console.log(`[${LABEL}] selftest OK (good=0 failures, bad=${badFailures.length} failures)`);
    process.exit(0);
  }

  if (!fs.existsSync(TARGET)) {
    console.error(`[${LABEL}] FAIL: target file not found: ${TARGET}`);
    process.exit(1);
  }
  const source = fs.readFileSync(TARGET, "utf8");
  const failures = checkUnmatchClearsBothSides(source);
  if (failures.length > 0) {
    console.error(`[${LABEL}] FAIL:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] PASS`);
}

main();
