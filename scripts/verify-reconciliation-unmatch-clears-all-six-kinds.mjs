#!/usr/bin/env node
/**
 * BANK-RECON-UNMATCH-CLEARS-ONLY-THREE-OF-SIX-MATCH-KINDS — the reconciliation workspace classifies
 * and renders six persisted match FKs (load, bill, settlement, expense, transfer, journal entry —
 * see ReconciliationWorkspace.tsx's 6 EntityLinks), but `POST /api/v1/banking/reconciliation/
 * :sessionId/unmatch` only cleared matched_load_id/matched_bill_id/matched_settlement_id and still
 * returned {ok: true}. An expense-, transfer-, or JE-matched transaction stayed matched after Unmatch.
 * Root cause: those 3 kinds are written by a SEPARATE subsystem (accounting/bank-recon/
 * match.service.ts's accept flow, denormalized onto the same bank_transactions row per
 * MATCHED_COLUMN_BY_KIND) that this route never accounted for.
 *
 * INVARIANT (static — no database): the unmatch handler's UPDATE must clear all 6 matched_*_id
 * columns the frontend renders, and for the 3 "other subsystem" kinds (expense/transfer/je) it must
 * also record a 'rejected' row in banking.reconciliation_matches — that table is the other
 * subsystem's own audit-of-record, and a bare NULL with no trace there would let a future
 * match-suggestion pass re-surface the exact same pairing with no memory of the unmatch.
 *
 * Self-test: node scripts/verify-reconciliation-unmatch-clears-all-six-kinds.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "apps/backend/src/banking/reconciliation.routes.ts";
const LABEL = "verify-reconciliation-unmatch-clears-all-six-kinds";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function checkUnmatchClearsAllSixKinds(src) {
  const problems = [];

  const start = src.indexOf('"/api/v1/banking/reconciliation/:sessionId/unmatch"');
  if (start === -1) {
    return [`${TARGET}: could not locate the /unmatch route handler`];
  }
  // The handler runs to end-of-file in practice (last route in the file); slice generously.
  const handler = src.slice(start, start + 6000);

  const requiredNulledColumns = [
    "matched_load_id = NULL",
    "matched_bill_id = NULL",
    "matched_settlement_id = NULL",
    "matched_expense_id = NULL",
    "matched_transfer_id = NULL",
    "matched_journal_entry_id = NULL",
  ];
  for (const col of requiredNulledColumns) {
    if (!handler.includes(col)) {
      problems.push(`${TARGET}: unmatch handler no longer clears "${col}"`);
    }
  }

  if (!/INSERT INTO banking\.reconciliation_matches/.test(handler)) {
    problems.push(`${TARGET}: unmatch handler no longer records a rejected row in banking.reconciliation_matches for the other-subsystem kinds`);
  }
  if (!/match_state\s*=\s*'rejected'/.test(handler)) {
    problems.push(`${TARGET}: unmatch handler's reconciliation_matches upsert no longer sets match_state = 'rejected'`);
  }
  if (!/prev_expense_id/.test(handler) || !/prev_transfer_id/.test(handler) || !/prev_journal_entry_id/.test(handler)) {
    problems.push(`${TARGET}: unmatch handler no longer captures the pre-clear expense/transfer/journal_entry ids (needed to record the rejection against the right ledger_entry_id)`);
  }

  return problems;
}

function selftest() {
  const good = `
    app.post(
      "/api/v1/banking/reconciliation/:sessionId/unmatch",
      async (req, reply) => {
        const res = await client.query(
          \`
            WITH prior AS (
              SELECT id, matched_expense_id, matched_transfer_id, matched_journal_entry_id
              FROM banking.bank_transactions
              WHERE id = $1
            )
            UPDATE banking.bank_transactions bt
            SET
              matched_load_id = NULL,
              matched_bill_id = NULL,
              matched_settlement_id = NULL,
              matched_expense_id = NULL,
              matched_transfer_id = NULL,
              matched_journal_entry_id = NULL,
              updated_at = now()
            FROM prior
            WHERE bt.id = prior.id
            RETURNING
              bt.id,
              prior.matched_expense_id::text AS prev_expense_id,
              prior.matched_transfer_id::text AS prev_transfer_id,
              prior.matched_journal_entry_id::text AS prev_journal_entry_id
          \`
        );
        for (const { kind, id } of rejectedKinds) {
          await client.query(\`
            INSERT INTO banking.reconciliation_matches (...)
            VALUES (...)
            ON CONFLICT (bank_transaction_id, ledger_entry_kind, ledger_entry_id)
            DO UPDATE SET
              match_score = 0,
              match_state = 'rejected',
              matched_at = now()
          \`);
        }
      }
    );
  `;
  const goodProblems = checkUnmatchClearsAllSixKinds(good);
  if (goodProblems.length) {
    console.error(`${LABEL} SELFTEST FAIL — known-good fixture flagged: ${goodProblems.join("; ")}`);
    process.exit(1);
  }

  const mutations = [
    good.replace("matched_expense_id = NULL,\n              matched_transfer_id = NULL,\n              matched_journal_entry_id = NULL,\n              updated_at", "updated_at"),
    good.replace("matched_load_id = NULL,\n              matched_bill_id = NULL,\n              matched_settlement_id = NULL,\n              ", ""),
    good.replace(/INSERT INTO banking\.reconciliation_matches[\s\S]*?match_state = 'rejected',\n              matched_at = now\(\)\n          \`\);/, "// no reject upsert"),
    good.replace(/prev_expense_id/g, "x").replace(/prev_transfer_id/g, "y").replace(/prev_journal_entry_id/g, "z"),
  ];
  for (const [i, mutated] of mutations.entries()) {
    if (checkUnmatchClearsAllSixKinds(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — regression mutation ${i} escaped detection`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} regression mutations all detected`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

const src = read(TARGET);
const failures = checkUnmatchClearsAllSixKinds(src);
if (failures.length) {
  console.error(`[${LABEL}] FAILED:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — unmatch clears all 6 matched_*_id columns and records a rejected row in banking.reconciliation_matches for the expense/transfer/journal_entry kinds`);
