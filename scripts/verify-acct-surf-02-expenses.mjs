#!/usr/bin/env node
/**
 * ACCT-SURF-02 — Expenses deep structural DoD.
 *
 * Frozen map: docs/trackers/ACCT-08-SURF-SURFACE-MAP-2026-07-25.md
 * Desktop: ~/Desktop/IH35-CURSOR-AUDIT/modules/accounting-surf-dod-2026-07-25.md
 *
 * Asserts:
 *  - DOD-A: /accounting/expenses -> ExpensesListPage; leaf present in subnav; no ComingSoon twin
 *  - VERIFY-1: RecordExpenseModal uses ParityDrawer; ExpensesListPage mounts RecordExpenseModal
 *  - VERIFY-2: RecordExpenseForm vendor/category/account pickers use ReferenceSelect createKind
 *  - DOD-B / VERIFY-3: submitRecordExpense -> createExpense POSTs /api/v1/expenses
 *  - VERIFY-3 server: createExpense INSERTs accounting.expenses (canonical — never RETIRE)
 *  - VERIFY-4: ExpensesListPage EntityLink vendor + journal_entry + expense (self); companion
 *    reverse guards (verify-acct-expense-list-reverse.mjs / -wo-reverse.mjs) stay present
 *
 * Does NOT invent payment_applications / reverse density beyond what companion guards already
 * assert. Live browser TRANSP+USMCA click-through remains UNVERIFIED unless recorded separately.
 *
 *   node scripts/verify-acct-surf-02-expenses.mjs
 *   node scripts/verify-acct-surf-02-expenses.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-acct-surf-02-expenses";

const FILES = {
  map: "docs/trackers/ACCT-08-SURF-SURFACE-MAP-2026-07-25.md",
  manifest: "apps/frontend/src/routes/manifest.tsx",
  subnav: "apps/frontend/src/pages/accounting/subnav-manifest.ts",
  list: "apps/frontend/src/pages/accounting/ExpensesListPage.tsx",
  modal: "apps/frontend/src/components/expenses/RecordExpenseModal.tsx",
  form: "apps/frontend/src/components/expenses/RecordExpenseForm.tsx",
  submit: "apps/frontend/src/components/expenses/recordExpenseSubmit.ts",
  api: "apps/frontend/src/api/accounting.ts",
  service: "apps/backend/src/accounting/expenses.routes.ts",
};

const REVERSE_GUARD_FILES = [
  "scripts/verify-acct-expense-list-reverse.mjs",
  "scripts/verify-acct-expense-list-wo-reverse.mjs",
];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function routeBlock(manifest, routePath) {
  const escaped = routePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`path=["']${escaped}["'][\\s\\S]{0,500}?(?=path=["']|$)`);
  const m = manifest.match(re);
  return m ? m[0] : "";
}

function contractErrors(src) {
  const errors = [];
  if (!src.map.includes("ACCT-SURF-02") || !src.map.includes("/accounting/expenses")) {
    errors.push("frozen map missing ACCT-SURF-02 → /accounting/expenses");
  }

  const block = routeBlock(src.manifest, "/accounting/expenses");
  if (!block) errors.push("DOD-A: missing route /accounting/expenses");
  else {
    if (/ComingSoonPage/.test(block)) {
      errors.push("DOD-A: /accounting/expenses must not mount ComingSoonPage");
    }
    if (!block.includes("<ExpensesListPage")) {
      errors.push("DOD-A: /accounting/expenses must render <ExpensesListPage />");
    }
  }
  if (!src.subnav.includes("/accounting/expenses")) {
    errors.push("DOD-A / NEVER-DELETE: Expenses leaf missing from subnav-manifest");
  }

  if (!src.modal.includes("ParityDrawer") || !src.modal.includes("<ParityDrawer")) {
    errors.push("VERIFY-1: RecordExpenseModal must use ParityDrawer");
  }
  if (!src.list.includes("RecordExpenseModal")) {
    errors.push("DOD-A: ExpensesListPage must mount RecordExpenseModal");
  }

  for (const needle of ['createKind="vendor"', 'createKind="category"', 'createKind="account"']) {
    if (!src.form.includes(needle)) {
      errors.push(`VERIFY-2: RecordExpenseForm must use ReferenceSelect ${needle}`);
    }
  }

  for (const needle of ["expense_date:", "amount_cents:", "payment_account_uuid:"]) {
    if (!src.submit.includes(needle)) {
      errors.push(`DOD-B: submitRecordExpense payload missing ${needle}`);
    }
  }

  if (!src.api.includes("function createExpense")) {
    errors.push("VERIFY-3: missing createExpense API helper");
  } else {
    const idx = src.api.indexOf("function createExpense");
    const nextExport = src.api.indexOf("\nexport function ", idx + 1);
    const slice = src.api.slice(idx, nextExport === -1 ? undefined : nextExport);
    if (!slice.includes('"/api/v1/expenses"') || !slice.includes('method: "POST"')) {
      errors.push("VERIFY-3: createExpense must POST /api/v1/expenses");
    }
  }

  if (!src.service.includes("INSERT INTO accounting.expenses")) {
    errors.push("VERIFY-3: createExpense server must INSERT INTO accounting.expenses (canonical)");
  }
  if (/INSERT INTO\s+bank\.expenses|INSERT INTO\s+payroll\.expenses/i.test(src.service)) {
    errors.push("VERIFY-3: createExpense must not write RETIRE schemas");
  }

  if (!src.list.includes('kind="vendor"')) {
    errors.push("VERIFY-4: ExpensesListPage must EntityLink vendor");
  }
  if (!src.list.includes('kind="journal_entry"')) {
    errors.push("VERIFY-4: ExpensesListPage must EntityLink journal_entry");
  }
  if (!src.list.includes('kind="expense"')) {
    errors.push("VERIFY-4: ExpensesListPage must EntityLink expense (self, Expense # column)");
  }
  if (!src.list.includes("No expense #")) {
    errors.push("VERIFY-4: ExpensesListPage must use No expense # for a visible row with empty document number (not entityLabel tombstone)");
  }
  if (!src.list.includes("humanMemo(")) {
    errors.push("VERIFY-4: ExpensesListPage JE column must humanMemo UUID posting memos");
  }
  if (/entityLabel\(r\.expense_number,\s*r\.id,\s*"Expense"\)/.test(src.list)) {
    errors.push("VERIFY-4: ExpensesListPage must not tombstone a visible expense # as Expense — not visible");
  }

  for (const rel of REVERSE_GUARD_FILES) {
    if (!fs.existsSync(path.join(ROOT, rel))) {
      errors.push(`VERIFY-4: companion reverse guard must remain present: ${rel}`);
    }
  }

  return errors;
}

function selftest() {
  const good = {
    map: "ACCT-SURF-02 `/accounting/expenses`",
    manifest: 'path="/accounting/expenses"\n<ExpensesListPage />\n',
    subnav: "/accounting/expenses",
    list: 'RecordExpenseModal\nkind="vendor"\nkind="journal_entry"\nkind="expense"\nNo expense #\nhumanMemo(\n',
    modal: "ParityDrawer\n<ParityDrawer\n",
    form: ['createKind="vendor"', 'createKind="category"', 'createKind="account"'].join("\n"),
    submit: "expense_date:\namount_cents:\npayment_account_uuid:\n",
    api: 'export function createExpense(){ return apiRequest("/api/v1/expenses", { method: "POST" }) }',
    service: "INSERT INTO accounting.expenses (operating_company_id)",
  };
  if (contractErrors(good).length) {
    console.error(`${LABEL} --selftest FAIL good:`, contractErrors(good));
    process.exit(1);
  }
  const longApi = {
    ...good,
    api:
      `export function createExpense(operatingCompanyId: string, body: { ${"optional_field?: string; ".repeat(90)} }) {\n` +
      `return apiRequest("/api/v1/expenses", { method: "POST" })\n}\n` +
      `export function nextHelper(){}`,
  };
  if (contractErrors(longApi).some((e) => e.includes("createExpense must POST"))) {
    console.error(`${LABEL} --selftest FAIL long typed createExpense was truncated before its POST call`);
    process.exit(1);
  }
  const thin = { ...good, modal: "export function RecordExpenseModal(){ return <div>thin</div> }" };
  if (!contractErrors(thin).some((e) => e.includes("ParityDrawer"))) {
    console.error(`${LABEL} --selftest FAIL thin modal not caught`);
    process.exit(1);
  }
  const twin = { ...good, manifest: 'path="/accounting/expenses"\n<ComingSoonPage />\n' };
  if (!contractErrors(twin).some((e) => e.includes("ComingSoon"))) {
    console.error(`${LABEL} --selftest FAIL ComingSoon twin not caught`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const src = Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, read(rel)]));
const errors = contractErrors(src);
if (errors.length) {
  console.error(`${LABEL}: FAIL`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `${LABEL}: PASS — ACCT-SURF-02 Expenses structural DoD (route+ParityDrawer+payload+canonical accounting.expenses+EntityLink); live browser still UNVERIFIED`
);
process.exit(0);
