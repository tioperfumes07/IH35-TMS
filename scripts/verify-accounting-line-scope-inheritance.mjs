#!/usr/bin/env node
// verify-accounting-line-scope-inheritance (0519-es1-58 — accounting child-LINE scope-inheritance ratchet)

import {
  hasEnforcedFk,
  hasOwnScopeColumn,
  loadCorpus,
} from "./lib/migration-scope-proof.mjs";

const SCOPE_INHERITANCE = [
  {
    child: "accounting.invoice_lines",
    parentIdCol: "invoice_id",
    parent: "accounting.invoices",
    status: "enforced",
  },
  {
    child: "accounting.expense_lines",
    parentIdCol: "expense_id",
    parent: "accounting.expenses",
    status: "enforced",
  },
  {
    child: "accounting.bill_lines",
    parentIdCol: "bill_id",
    parent: "accounting.bills",
    status: "deferred",
    deferredTo: "db-integrity-hardening-0519 (owner-gated FK migration)",
  },
];

export { hasEnforcedFk, hasOwnScopeColumn, loadCorpus };

export function runAccountingLineScopeInheritance() {
  const corpus = loadCorpus();
  const failures = [];
  const notes = [];
  for (const entry of SCOPE_INHERITANCE) {
    const fk = hasEnforcedFk(corpus, entry.child, entry.parentIdCol, entry.parent);
    if (entry.status === "enforced") {
      if (!fk) {
        failures.push(
          `${entry.child}.${entry.parentIdCol} is registered status:"enforced" but NO enforced FK -> ${entry.parent} was found in db/migrations/. Restore the FK (regression lock).`,
        );
      } else {
        notes.push(`OK        ${entry.child}.${entry.parentIdCol} -> ${entry.parent} (enforced FK present)`);
      }
    } else if (fk) {
      failures.push(
        `${entry.child}.${entry.parentIdCol} now HAS an enforced FK -> ${entry.parent}, but the registry still lists it status:"deferred". PROMOTE it to status:"enforced" in verify-accounting-line-scope-inheritance.mjs.`,
      );
    } else {
      const ownScope = hasOwnScopeColumn(corpus, entry.child);
      notes.push(
        `DEFERRED  ${entry.child}.${entry.parentIdCol} -> ${entry.parent} — no FK yet (own scope col: ${ownScope ? "yes" : "NO"}); awaiting ${entry.deferredTo}`,
      );
    }
  }
  return { failures, notes };
}

if (process.argv.includes("--selftest")) {
  const corpus = `
    CREATE TABLE accounting.invoice_lines (
      id uuid PRIMARY KEY,
      operating_company_id uuid NOT NULL REFERENCES org.companies(id),
      invoice_id uuid NOT NULL REFERENCES accounting.invoices(id) ON DELETE CASCADE
    );
    CREATE TABLE accounting.bill_lines (
      id uuid PRIMARY KEY,
      bill_id uuid NOT NULL
    );
    CREATE TABLE accounting.bill_payments (
      id uuid PRIMARY KEY,
      bill_id uuid NOT NULL REFERENCES accounting.bills(id)
    );
    ALTER TABLE accounting.expense_lines
      ADD CONSTRAINT fk_exp FOREIGN KEY (expense_id) REFERENCES accounting.expenses(id) ON DELETE RESTRICT;
  `;
  const checks = [
    ["invoice_lines inline FK", hasEnforcedFk(corpus, "accounting.invoice_lines", "invoice_id", "accounting.invoices") === true],
    ["invoice_lines own scope", hasOwnScopeColumn(corpus, "accounting.invoice_lines") === true],
    ["bill_lines no FK (scoped to child)", hasEnforcedFk(corpus, "accounting.bill_lines", "bill_id", "accounting.bills") === false],
    ["bill_lines no own scope", hasOwnScopeColumn(corpus, "accounting.bill_lines") === false],
    ["expense_lines ALTER FK", hasEnforcedFk(corpus, "accounting.expense_lines", "expense_id", "accounting.expenses") === true],
  ];
  const bad = checks.filter(([, ok]) => !ok).map(([label]) => label);
  if (bad.length) {
    console.error(`verify-accounting-line-scope-inheritance selftest FAIL: ${bad.join(", ")}`);
    process.exit(1);
  }
  console.log("verify-accounting-line-scope-inheritance selftest OK");
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { failures, notes } = runAccountingLineScopeInheritance();
  for (const n of notes) console.log(`  ${n}`);
  if (failures.length) {
    console.error("verify:accounting-line-scope-inheritance FAIL:");
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log(
    `verify:accounting-line-scope-inheritance OK — ${SCOPE_INHERITANCE.length} registered line tables match their declared FK-inheritance state`,
  );
}
