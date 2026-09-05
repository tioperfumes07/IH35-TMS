#!/usr/bin/env node
// B.1 GUARD (banking reconcile matcher — expense candidate).
// Owner order 2026-09-05: "suggest exact cents ±5d to expenses/bills". The obligation matcher
// already suggested bank matches for bills, fuel, work orders, invoices, loads and settlements but
// NOT expenses — the single most common thing a bank debit reconciles against. This guard locks the
// expense candidate + Accept wiring into the canonical matcher so it cannot silently regress:
//   1. reconcile obligation_type enum accepts "expense"
//   2. loadObligationCandidates emits obligation_type "expense" rows read from accounting.expenses
//   3. OBLIGATION_EXISTENCE_SQL validates an expense id belongs to the company before Accept writes it
//   4. the Accept path routes "expense" through the generic linked_entity_id + category_kind pair
//      (Accept marks the txn reconciled; it never posts a JE here — never auto-post)
// It never asserts a new GL/posting path — reconcile only marks a match.
import { readFileSync } from "node:fs";

const ROUTES = "apps/backend/src/banking/obligation-reconcile.routes.ts";
const fail = (m) => { console.error(`FAIL verify-banking-reconcile-expense-candidate: ${m}`); process.exit(1); };

const CHECKS = [
  // 1 — enum
  { id: "enum", ok: (s) => /obligation_type:\s*z\.enum\(\[[^\]]*"expense"[^\]]*\]\)/.test(s) },
  // 2 — candidate loader reads accounting.expenses and pushes obligation_type "expense"
  { id: "candidate-select", ok: (s) => /SELECT id, expense_number, total_amount_cents, transaction_date::text/.test(s) },
  { id: "candidate-push", ok: (s) => /obligation_type:\s*"expense"/.test(s) },
  // 3 — existence allow-list entry
  { id: "existence-sql", ok: (s) => /expense:\s*`SELECT 1 FROM accounting\.expenses/.test(s) },
  // 4 — accept path routes expense through the linked (generic) path
  { id: "accept-linked", ok: (s) => /obligation_type === "expense"/.test(s) },
];

function verify(text) {
  const failures = [];
  for (const c of CHECKS) {
    if (!c.ok(text)) failures.push(c.id);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const source = readFileSync(ROUTES, "utf8");
  const baseline = verify(source);
  if (baseline.length) fail(`baseline is not green — real checks failing: ${baseline.join(", ")}`);
  const mutations = [
    source.replace('"expense", "factoring_batch"', '"factoring_batch"'),
    source.replace("SELECT id, expense_number, total_amount_cents, transaction_date::text", "SELECT id, broken_col"),
    source.replaceAll('obligation_type: "expense"', 'obligation_type: "NOPE"'),
    source.replace("expense: `SELECT 1 FROM accounting.expenses", "expenseNOPE: `SELECT 1 FROM accounting.expenses"),
    source.replaceAll('obligation_type === "expense"', 'obligation_type === "NOPE"'),
  ];
  for (const m of mutations) {
    if (m === source) fail("a selftest mutation did not change the source — the check is stale");
    if (verify(m).length === 0) fail("a mutation still passed — a check is too weak");
  }
  console.log(`OK verify-banking-reconcile-expense-candidate --selftest: baseline green, ${mutations.length} mutations all caught.`);
  process.exit(0);
}

const failures = verify(readFileSync(ROUTES, "utf8"));
if (failures.length) fail(`expense reconcile-candidate wiring missing: ${failures.join(", ")}`);
console.log("OK verify-banking-reconcile-expense-candidate: expense is a first-class reconcile-match candidate (enum + candidate + existence + Accept).");
