#!/usr/bin/env node
/**
 * BANK-F5744 — ReconciliationWorkspace.tsx's matched-entity EntityLinks (Load/Bill/Settlement/Expense
 * in the bank-transaction list) hardcoded `entityLabel(null, tx.matched_*_id, noun)`, structurally
 * discarding the human labels the backend already joins alongside every matched id
 * (plaid/link.routes.ts selects matched_load_number/matched_bill_number/matched_settlement_display_id/
 * matched_expense_number — all typed on PlaidBankTransaction in apps/frontend/src/api/banking.ts, per
 * the BANK-F5662/ACCT-F5153/EXPENSE-column-wave comments already on that type). Every matched
 * transaction rendered as "Load — not visible" / "Bill — not visible" / etc. even when the real number
 * was one field away.
 *
 * INVARIANT (static): the matched_load_id/matched_bill_id/matched_settlement_id/matched_expense_id
 * EntityLinks must pass their sibling *_number/*_display_id field as entityLabel's name argument, never
 * a hardcoded null.
 *
 * Self-test: node scripts/verify-reconciliation-workspace-matched-labels-not-null.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "apps/frontend/src/pages/banking/ReconciliationWorkspace.tsx";
const LABEL = "verify-reconciliation-workspace-matched-labels-not-null";

const PAIRS = [
  { idField: "matched_load_id", labelField: "matched_load_number" },
  { idField: "matched_bill_id", labelField: "matched_bill_number" },
  { idField: "matched_settlement_id", labelField: "matched_settlement_display_id" },
  { idField: "matched_expense_id", labelField: "matched_expense_number" },
];

export function checkMatchedLabels(src) {
  const problems = [];
  for (const { idField, labelField } of PAIRS) {
    // Find the entityLabel(...) call whose id argument is `tx.<idField>` and assert its name argument
    // threads `tx.<labelField>`, not a bare `null`.
    const re = new RegExp(`entityLabel\\(([^,]+),\\s*tx\\.${idField}\\s*,`, "m");
    const m = src.match(re);
    if (!m) {
      problems.push(`${TARGET}: no entityLabel(...) call found for tx.${idField}`);
      continue;
    }
    const nameArg = m[1].trim();
    if (nameArg === "null") {
      problems.push(`${TARGET}: entityLabel for tx.${idField} still passes a hardcoded null instead of tx.${labelField}`);
      continue;
    }
    if (!nameArg.includes(`tx.${labelField}`)) {
      problems.push(`${TARGET}: entityLabel for tx.${idField} does not thread tx.${labelField} (found "${nameArg}")`);
    }
  }
  return problems;
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function selftest() {
  const good = `
    {tx.matched_load_id ? (
      <EntityLink kind="load" id={tx.matched_load_id} label={entityLabel(tx.matched_load_number ?? null, tx.matched_load_id, "Load")} />
    ) : null}
    {tx.matched_bill_id ? (
      <EntityLink kind="bill" id={tx.matched_bill_id} label={entityLabel(tx.matched_bill_number ?? null, tx.matched_bill_id, "Bill")} />
    ) : null}
    {tx.matched_settlement_id ? (
      <EntityLink kind="settlement" id={tx.matched_settlement_id} label={entityLabel(tx.matched_settlement_display_id ?? null, tx.matched_settlement_id, "Settlement")} />
    ) : null}
    {tx.matched_expense_id ? (
      <EntityLink kind="expense" id={tx.matched_expense_id} label={entityLabel(tx.matched_expense_number ?? null, tx.matched_expense_id, "Expense")} />
    ) : null}
  `;
  const goodProblems = checkMatchedLabels(good);
  if (goodProblems.length) {
    console.error(`${LABEL} SELFTEST FAIL — known-good fixture flagged: ${goodProblems.join("; ")}`);
    process.exit(1);
  }

  const mutations = [
    good.replace("entityLabel(tx.matched_load_number ?? null, tx.matched_load_id,", "entityLabel(null, tx.matched_load_id,"),
    good.replace("entityLabel(tx.matched_bill_number ?? null, tx.matched_bill_id,", "entityLabel(null, tx.matched_bill_id,"),
    good.replace("entityLabel(tx.matched_settlement_display_id ?? null, tx.matched_settlement_id,", "entityLabel(null, tx.matched_settlement_id,"),
    good.replace("entityLabel(tx.matched_expense_number ?? null, tx.matched_expense_id,", "entityLabel(null, tx.matched_expense_id,"),
  ];
  for (const [i, mutated] of mutations.entries()) {
    if (checkMatchedLabels(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — regression mutation ${i} escaped detection`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} regression mutations all detected`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

const src = read(TARGET);
const failures = checkMatchedLabels(src);
if (failures.length) {
  console.error(`${LABEL} FAIL:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — all 4 matched-entity EntityLinks thread their real human label field, none is a hardcoded-null tombstone`);
