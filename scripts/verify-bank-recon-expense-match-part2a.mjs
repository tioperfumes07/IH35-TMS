#!/usr/bin/env node
// BLOCK-01 Part 2a static guard — locks the expense-link accept path so it can't regress
// (CLAUDE.md §2: every bug fix / gated feature gets a static CI guard).
//
// Invariants:
//   (1) match.service.ts PERSISTABLE_MATCH_KINDS includes 'expense' but NEVER 'bill'
//       ('bill' accept = record a bill payment = Part 2b, blocked on CHAIN-04; persisting a 'bill'
//       match would be an orphan write and violate the migration CHECK).
//   (2) The Part 2a migration widened the reconciliation_matches CHECK to include 'expense' and NOT
//       'bill', and added banking.bank_transactions.matched_expense_id. The service set and the
//       migration CHECK must stay in lockstep.
//   (3) The expense accept path is guarded: it requires posting_status='posted' (link + clear only,
//       no new JE) and enforces idempotency (bank_transaction_already_matched).
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const svcPath = path.join(repoRoot, "apps/backend/src/accounting/bank-recon/match.service.ts");
const migPath = path.join(repoRoot, "db/migrations/202607011600_bank_recon_expense_match_part2a.sql");

const failures = [];

if (!fs.existsSync(svcPath)) {
  failures.push("missing apps/backend/src/accounting/bank-recon/match.service.ts");
} else {
  const src = fs.readFileSync(svcPath, "utf8");
  const setMatch = src.match(/PERSISTABLE_MATCH_KINDS[\s\S]*?new Set<LedgerEntryKind>\(\[([\s\S]*?)\]\)/);
  if (!setMatch) {
    failures.push("match.service.ts: could not find PERSISTABLE_MATCH_KINDS set");
  } else {
    const body = setMatch[1];
    if (!/["']expense["']/.test(body)) failures.push("match.service.ts: PERSISTABLE_MATCH_KINDS must include 'expense' (Part 2a)");
    if (/["']bill["']/.test(body)) failures.push("match.service.ts: PERSISTABLE_MATCH_KINDS must NOT include 'bill' (Part 2b, blocked on CHAIN-04)");
  }
  if (!/expense_not_posted/.test(src)) failures.push("match.service.ts: expense accept must reject non-posted expenses (expense_not_posted)");
  if (!/bank_transaction_already_matched/.test(src)) failures.push("match.service.ts: accept must enforce idempotency (bank_transaction_already_matched)");
  if (!/matched_expense_id/.test(src)) failures.push("match.service.ts: must stamp matched_expense_id on clear");
}

if (!fs.existsSync(migPath)) {
  failures.push("missing db/migrations/202607011600_bank_recon_expense_match_part2a.sql");
} else {
  const sql = fs.readFileSync(migPath, "utf8");
  const check = sql.match(/CHECK\s*\(ledger_entry_kind IN \(([^)]*)\)\)/i);
  if (!check) {
    failures.push("Part 2a migration: could not find the ledger_entry_kind CHECK");
  } else {
    if (!/'expense'/.test(check[1])) failures.push("Part 2a migration: CHECK must include 'expense'");
    if (/'bill'/.test(check[1])) failures.push("Part 2a migration: CHECK must NOT include 'bill'");
  }
  if (!/ADD COLUMN IF NOT EXISTS matched_expense_id/.test(sql)) {
    failures.push("Part 2a migration: must add banking.bank_transactions.matched_expense_id");
  }
}

if (failures.length > 0) {
  console.error("verify:bank-recon-expense-match-part2a — FAILED");
  for (const m of failures) console.error(`- ${m}`);
  process.exit(1);
}
console.log("verify:bank-recon-expense-match-part2a — OK");
