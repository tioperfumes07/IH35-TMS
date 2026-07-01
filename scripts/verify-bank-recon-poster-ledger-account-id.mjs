#!/usr/bin/env node
// BLOCK-01 static guard — locks the bank-recon variance-poster bank-leg fix so it can't regress
// (CLAUDE.md §2: every bug fix gets a static CI guard).
//
//   BUG: match.service.ts postDifferenceJournalEntry read `coa_account_id` FROM banking.bank_accounts.
//        That column does NOT exist (the bank→GL bridge is banking.bank_accounts.ledger_account_id,
//        FK migration 202606280100). Every penny-variance post threw 42703 "column coa_account_id
//        does not exist". Same bridge CHAIN-04/05 use.
//
// This guard: (1) NO source under apps/backend/src may SELECT coa_account_id FROM banking.bank_accounts,
// (2) the old error string bank_account_missing_coa_account_id must be gone, (3) the poster must read
// ledger_account_id FROM banking.bank_accounts.
//
// NOTE: coa_account_id is a legitimate column on banking.bank_transactions (migration 0087) — this guard
// bans it ONLY when read from banking.bank_accounts, never globally.
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const srcRoot = path.join(repoRoot, "apps/backend/src");
const posterPath = path.join(srcRoot, "accounting/bank-recon/match.service.ts");

const failures = [];

// Walk apps/backend/src for .ts files (skip node_modules/dist).
function walk(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === "dist") continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(p));
    else if (ent.name.endsWith(".ts")) out.push(p);
  }
  return out;
}

// The broken read: coa_account_id selected FROM banking.bank_accounts (either order, small window).
const badReadA = /coa_account_id[\s\S]{0,80}FROM\s+banking\.bank_accounts/i;
const badReadB = /FROM\s+banking\.bank_accounts[\s\S]{0,200}\bcoa_account_id\b/i;
const badErrString = /bank_account_missing_coa_account_id/;

for (const file of walk(srcRoot)) {
  const src = fs.readFileSync(file, "utf8");
  const rel = path.relative(repoRoot, file);
  if (badReadA.test(src) || badReadB.test(src)) {
    failures.push(`${rel}: reads coa_account_id FROM banking.bank_accounts (that column does not exist — use ledger_account_id)`);
  }
  if (badErrString.test(src)) {
    failures.push(`${rel}: references the retired error string bank_account_missing_coa_account_id (should be bank_account_missing_ledger_account_id)`);
  }
}

// Positive: the poster must resolve the cash leg via ledger_account_id FROM banking.bank_accounts.
if (!fs.existsSync(posterPath)) {
  failures.push("missing apps/backend/src/accounting/bank-recon/match.service.ts");
} else {
  const src = fs.readFileSync(posterPath, "utf8");
  if (!(/ledger_account_id[\s\S]{0,80}FROM\s+banking\.bank_accounts/i.test(src) ||
        /FROM\s+banking\.bank_accounts[\s\S]{0,200}ledger_account_id/i.test(src))) {
    failures.push("match.service.ts variance poster must SELECT ledger_account_id FROM banking.bank_accounts");
  }
  if (!/bank_account_missing_ledger_account_id/.test(src)) {
    failures.push("match.service.ts must throw bank_account_missing_ledger_account_id when the bank account has no ledger link");
  }
}

if (failures.length > 0) {
  console.error("verify:bank-recon-poster-ledger-account-id — FAILED");
  for (const m of failures) console.error(`- ${m}`);
  process.exit(1);
}
console.log("verify:bank-recon-poster-ledger-account-id — OK");
