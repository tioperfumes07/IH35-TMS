#!/usr/bin/env node
// Guard for the Banking Match Drawer candidate engine (Part 1).
// Asserts that fetchLedgerCandidates in match.service.ts still:
//   1. sources open BILLS (accounting.bills) AND EXPENSES (accounting.expenses) as candidates, and
//   2. branches on the bank line's direction (is_credit) — a deposit must never surface
//      bills/expenses and a withdrawal must never surface AR payments.
// If a refactor drops either source or the direction branch, the candidate set silently regresses
// (e.g. suggesting a bill for a deposit, or losing bill/expense matching entirely). Fail loud.
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const servicePath = path.join(repoRoot, "apps/backend/src/accounting/bank-recon/match.service.ts");

function fail(messages) {
  console.error("verify:bank-match-candidate-sources — FAILED");
  for (const message of messages) console.error(`- ${message}`);
  process.exit(1);
}

const failures = [];

if (!fs.existsSync(servicePath)) {
  failures.push("missing apps/backend/src/accounting/bank-recon/match.service.ts");
} else {
  const source = fs.readFileSync(servicePath, "utf8");

  // Isolate the fetchLedgerCandidates function body so the assertions can't be satisfied by
  // unrelated references elsewhere in the file.
  const fnStart = source.indexOf("async function fetchLedgerCandidates");
  const fnBody = fnStart >= 0 ? source.slice(fnStart, source.indexOf("\n}\n", fnStart) + 2) : "";

  if (!fnBody) {
    failures.push("could not locate fetchLedgerCandidates function body");
  } else {
    if (!/FROM accounting\.bills\b/.test(fnBody)) {
      failures.push("fetchLedgerCandidates must source candidates FROM accounting.bills (open bills)");
    }
    if (!/FROM accounting\.expenses\b/.test(fnBody)) {
      failures.push("fetchLedgerCandidates must source candidates FROM accounting.expenses");
    }
    // Direction awareness: the function must take an is_credit-style boolean and branch on it.
    if (!/isCredit/.test(fnBody)) {
      failures.push("fetchLedgerCandidates must accept a direction (isCredit) parameter");
    }
    if (!/if\s*\(\s*isCredit\s*\)/.test(fnBody)) {
      failures.push("fetchLedgerCandidates must branch on isCredit (money-in sources)");
    }
    if (!/if\s*\(\s*!isCredit\s*\)/.test(fnBody)) {
      failures.push("fetchLedgerCandidates must branch on !isCredit (money-out sources: bills/expenses)");
    }
  }

  // The bill/expense candidate kinds must exist in the union type but MUST NOT be persistable
  // (bank.reconciliation_matches CHECK only allows payment/bill_payment/transfer/je in Part 1).
  if (!/PERSISTABLE_MATCH_KINDS/.test(source)) {
    failures.push("match.service must guard auto-store with PERSISTABLE_MATCH_KINDS (bill/expense are read-only in Part 1)");
  }
}

if (failures.length > 0) fail(failures);
console.log("verify:bank-match-candidate-sources — OK");
