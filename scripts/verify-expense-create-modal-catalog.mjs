#!/usr/bin/env node
/**
 * verify-expense-create-modal-catalog — Expense create surface must be a MODAL with flat framing and
 * canonical inline "+ Add new ___" catalog pickers (skill §7 design law). Locks:
 *   (1) MODAL TRIGGER: the Accounting → Expenses list "Record expense" control renders RecordExpenseModal
 *       (opened via state), NOT a page navigation. The /accounting/expenses/create route stays as an
 *       additive deep-link fallback.
 *   (2) NO NESTED BOX: no `rounded-sm border … p-4` card wraps the form in the modal body / the form /
 *       the fallback page (the Modal or the SubNav wrapper is the single frame — no box-in-box).
 *   (3) INLINE CATALOG CREATE: BOTH the Vendor and Category pickers expose an inline "+ Add new ___"
 *       creator (shared ReferenceSelect → canonical mdata.vendors / catalogs.accounts).
 *   (4) VOCAB: zero "+ New" literal anywhere on the expense-create surface (inline create is "+ Add new").
 *   (5) SAMPLE SAFETY: the real modal exposes an operator control bound both ways to isSampleData;
 *       carrying the field only in the submit mapper is inert when no UI can ever set it true.
 *
 * --selftest exercises each assertion against inline fixtures (pass + each failure mode).
 * LINKAGE: N/A (UI design-law enforcement). Additive only.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-expense-create-modal-catalog";
const LIST = "apps/frontend/src/pages/accounting/ExpensesListPage.tsx";
const MODAL = "apps/frontend/src/components/expenses/RecordExpenseModal.tsx";
const FORM = "apps/frontend/src/components/expenses/RecordExpenseForm.tsx";
const PAGE = "apps/frontend/src/pages/accounting/ExpenseCreatePage.tsx";

// A bordered "card" box = rounded-sm + border + p-4 in one className (inputs use px-2, so they don't match).
const NESTED_BOX_RE = /rounded-sm border[^"'`]*\bp-4\b/;

export function assertExpenseCreate({ list, modal, form, page }) {
  const errors = [];

  // (1) modal trigger, not page nav
  if (!/RecordExpenseModal/.test(list)) {
    errors.push(`${LIST}: does not render RecordExpenseModal (the list "Record expense" trigger must open the modal)`);
  }
  if (!/setCreateOpen\(\s*true\s*\)/.test(list)) {
    errors.push(`${LIST}: the "Record expense" trigger does not open the modal (expected an onClick setCreateOpen(true), not a page navigation)`);
  }

  // (2) no nested bordered box on the create surface
  for (const [name, src] of [[MODAL, modal], [FORM, form], [PAGE, page]]) {
    if (NESTED_BOX_RE.test(src)) {
      errors.push(`${name}: has a nested bordered card (rounded-sm border … p-4) — the Modal/SubNav is the single frame (no box-in-box)`);
    }
  }

  // (3) inline "+ Add new" for BOTH vendor and category
  if (!/createKind=["']vendor["']/.test(form)) {
    errors.push(`${FORM}: Vendor picker has no inline "+ Add new vendor" (expected ReferenceSelect createKind="vendor")`);
  }
  if (!/createKind=["']category["']/.test(form)) {
    errors.push(`${FORM}: Category picker has no inline "+ Add new category" (expected ReferenceSelect createKind="category")`);
  }

  // (4) no "+ New" vocab anywhere on the surface
  for (const [name, src] of [[LIST, list], [MODAL, modal], [FORM, form], [PAGE, page]]) {
    if (/\+\s*New\b/.test(src)) {
      errors.push(`${name}: contains a "+ New" literal — inline create must be "+ Add new ___" (§7 vocab lock)`);
    }
  }

  // (5) the month-end TEST flag must be reachable from the actual form, not submit-only dead state
  if (!/data-testid=["']record-expense-is-sample-data["']/.test(form)) {
    errors.push(`${FORM}: no visible TEST/sample expense control (is_sample_data cannot be set from Live Chrome)`);
  }
  if (!/checked=\{values\.isSampleData\}/.test(form)) {
    errors.push(`${FORM}: TEST/sample expense control is not bound to values.isSampleData`);
  }
  if (!/isSampleData:\s*event\.target\.checked/.test(form)) {
    errors.push(`${FORM}: TEST/sample expense control does not write the operator choice back to form state`);
  }

  return errors;
}

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

function selftest() {
  const good = {
    list: `import { RecordExpenseModal } from "x";\n<button onClick={() => setCreateOpen(true)}>+ Record expense</button>\n<RecordExpenseModal open={createOpen} />`,
    modal: `<Modal><div className="space-y-4"><RecordExpenseForm /></div></Modal>`,
    form: `<ReferenceSelect createKind="vendor" /> ... <ReferenceSelect createKind="category" /> <input className="rounded-sm border border-gray-300 px-2" /><input data-testid="record-expense-is-sample-data" checked={values.isSampleData} onChange={(event) => setValues((prev) => ({ ...prev, isSampleData: event.target.checked }))} />`,
    page: `<div className="mx-auto max-w-3xl"><RecordExpenseForm /></div>`,
  };
  const cases = [
    { name: "well-formed → 0 errors", in: good, want: 0 },
    { name: "list is page-nav not modal", in: { ...good, list: `<Link to="/accounting/expenses/create">+ Record expense</Link>` }, wantMin: 1 },
    { name: "nested box in page", in: { ...good, page: `<div className="mx-auto max-w-3xl rounded-sm border border-gray-200 p-4"><RecordExpenseForm /></div>` }, wantMin: 1 },
    { name: "vendor not inline-create", in: { ...good, form: good.form.replace(`createKind="vendor"`, "") }, wantMin: 1 },
    { name: "category not inline-create", in: { ...good, form: good.form.replace(`createKind="category"`, "") }, wantMin: 1 },
    { name: "'+ New' vocab present", in: { ...good, form: `${good.form}<button>+ New</button>` }, wantMin: 1 },
    { name: "sample control missing", in: { ...good, form: good.form.replace(`data-testid="record-expense-is-sample-data"`, `data-testid="removed"`) }, wantMin: 1 },
    { name: "sample control cannot update state", in: { ...good, form: good.form.replace("isSampleData: event.target.checked", "isSampleData: false") }, wantMin: 1 },
  ];
  let failed = 0;
  for (const c of cases) {
    const n = assertExpenseCreate(c.in).length;
    const ok = c.want !== undefined ? n === c.want : n >= c.wantMin;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${c.name}  (errors=${n})`);
  }
  if (failed) { console.error(`\n${LABEL} SELFTEST FAILED: ${failed}`); process.exit(1); }
  console.log(`\n${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) { selftest(); process.exit(0); }

const inputs = { list: read(LIST), modal: read(MODAL), form: read(FORM), page: read(PAGE) };
for (const [k, v] of Object.entries(inputs)) {
  if (v == null) { console.error(`[${LABEL}] FAILED — missing file for ${k}`); process.exit(1); }
}
const errors = assertExpenseCreate(inputs);
if (errors.length) {
  console.error(`[${LABEL}] FAILED — ${errors.length} issue(s):`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — Expense create is a flat modal with canonical inline catalog pickers and a reachable TEST/sample flag.`);
