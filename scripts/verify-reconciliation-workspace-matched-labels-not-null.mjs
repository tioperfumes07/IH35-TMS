#!/usr/bin/env node
/**
 * BANK-F5744 — matched-entity EntityLinks must thread sibling human labels, never hardcoded null.
 * BANK-F-MATCHED-EXPENSE-EMPTY-NUMBER — empty expense_number is a missing document #, not an RLS
 * tombstone. entityLabel(number, id, "Expense") paints "Expense — not visible" on a row the operator
 * just matched. visibleDocumentLabel is the same pattern as ExpensesListPage.
 *
 * Self-test: node scripts/verify-reconciliation-workspace-matched-labels-not-null.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-reconciliation-workspace-matched-labels-not-null";

const WORKSPACE = "apps/frontend/src/pages/banking/ReconciliationWorkspace.tsx";
const EXPENSE_SURFACES = [
  { file: WORKSPACE, idPrefix: "tx" },
  { file: "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx", idPrefix: "tx" },
  { file: "apps/frontend/src/pages/banking/BankAccountDetail.tsx", idPrefix: "row" },
  { file: "apps/frontend/src/pages/banking/components/BankingPlaidConnectionsPanel.tsx", idPrefix: "t" },
];

const PAIRS = [
  { idField: "matched_load_id", labelField: "matched_load_number" },
  { idField: "matched_bill_id", labelField: "matched_bill_number" },
  { idField: "matched_settlement_id", labelField: "matched_settlement_display_id" },
  { idField: "matched_expense_id", labelField: "matched_expense_number", requireVisibleDocument: true },
];

export function checkMatchedLabels(src, { file = "fixture", idPrefix = "tx", pairs = PAIRS } = {}) {
  const problems = [];
  for (const { idField, labelField, requireVisibleDocument } of pairs) {
    const re = new RegExp(
      `(entityLabel|visibleDocumentLabel)\\(([^,]+),\\s*${idPrefix}\\.${idField}\\s*,`,
      "m",
    );
    const m = src.match(re);
    if (!m) {
      problems.push(`${file}: no entityLabel/visibleDocumentLabel(...) call found for ${idPrefix}.${idField}`);
      continue;
    }
    const fn = m[1];
    const nameArg = m[2].trim();
    if (nameArg === "null") {
      problems.push(`${file}: ${fn} for ${idPrefix}.${idField} still passes a hardcoded null instead of ${idPrefix}.${labelField}`);
      continue;
    }
    if (!nameArg.includes(`${idPrefix}.${labelField}`)) {
      problems.push(`${file}: ${fn} for ${idPrefix}.${idField} does not thread ${idPrefix}.${labelField} (found "${nameArg}")`);
    }
    if (requireVisibleDocument && fn !== "visibleDocumentLabel") {
      problems.push(
        `${file}: matched expense must use visibleDocumentLabel so empty expense_number is "Expense", not "Expense — not visible"`,
      );
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
      <EntityLink kind="expense" id={tx.matched_expense_id} label={visibleDocumentLabel(tx.matched_expense_number ?? null, tx.matched_expense_id, "Expense")} />
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
    good.replace(
      "visibleDocumentLabel(tx.matched_expense_number ?? null, tx.matched_expense_id,",
      "entityLabel(tx.matched_expense_number ?? null, tx.matched_expense_id,",
    ),
    good.replace(
      "visibleDocumentLabel(tx.matched_expense_number ?? null, tx.matched_expense_id,",
      "visibleDocumentLabel(null, tx.matched_expense_id,",
    ),
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

const expensePair = PAIRS.filter((p) => p.idField === "matched_expense_id");
const failures = [
  ...checkMatchedLabels(read(WORKSPACE), { file: WORKSPACE, idPrefix: "tx" }),
];
for (const target of EXPENSE_SURFACES) {
  if (target.file === WORKSPACE) continue;
  failures.push(
    ...checkMatchedLabels(read(target.file), { ...target, pairs: expensePair }),
  );
}
if (failures.length) {
  console.error(`${LABEL} FAIL:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(
  `${LABEL} PASS — workspace threads all matched labels; ${EXPENSE_SURFACES.length} surfaces use visibleDocumentLabel for expense`,
);
