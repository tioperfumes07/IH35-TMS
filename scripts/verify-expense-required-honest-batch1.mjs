#!/usr/bin/env node
/** @matrix-built {"modules":["accounting","maintenance"],"cols":["expense"],"leafRe":"^(expenses\\.create|wo\\.create|wo\\.source\\.is|wo\\.source\\.es|wo\\.source\\.ac|wo\\.source\\.et|wo\\.source\\.rt|wo\\.source\\.it|wo\\.create_expense|maintenance\\.modal\\.create_expense)$","task":"LINK-F5189-EXPENSE-COLUMN-HONESTY-BATCH1"} */
/**
 * LINK-F5189 — expense Required-column honesty audit, batch 1. Three parallel Explore
 * investigations covered accounting (11 leaves), maintenance (10 leaves), and a mixed
 * banking/cash-flow/fleet/fuel/home/insurance/reports/safety/vendors batch (15 leaves).
 * 10 genuine gaps closed to 3 code fixes; 15 false-required corrections.
 *
 * BUILT:
 *   - RecordExpenseModal.tsx (closes accounting:expenses.create): onSubmitted discarded the
 *     real created accounting.expenses id (created.targetId, from RecordExpenseForm); now
 *     forwards it through onCreated. ExpensesListPage.tsx's onCreated now calls
 *     setHighlightedExpenseId(expenseId), reusing the existing deep-link banner + row-highlight
 *     mechanism (the expense_number column already links kind="expense" per row).
 *   - CreateWorkOrderModal.tsx (closes maintenance:wo.create + 6 wo.source.* leaves, all one
 *     component/wizard): when payment_timing==="paid_same_day", the backend already returns a
 *     real created expense (response.expense.uuid via autoCreateExpenseFromWO); the frontend
 *     used it only to pick a toast string, then discarded it. Now captured in createdExpense
 *     state and rendered as EntityLink kind="expense" in the post-create confirmation block.
 *   - CreateExpenseModal.tsx (closes maintenance:wo.create_expense + maintenance.modal.create_expense,
 *     one file): same "auto-close past the id" bug already fixed once this session in
 *     CreateBillModal.tsx (ap_bill sweep) -- RecordExpenseForm's onSubmitted already returns
 *     created.targetId, but the modal called onClose() in the same tick. Now holds a
 *     createdExpenseId confirmation step (EntityLink kind="expense" + Done button).
 *
 * RECLASSIFIED false-required (dropped, not force-built -- each verified against a real
 * absence of any INSERT INTO accounting.expenses in the relevant flow, or a real GL-account/
 * category-picker/rollup shape with no owning expense record):
 *   accounting: bills.create.vendor, accounting.panel.trk_bulk_register, accounting.panel.detail,
 *     accounting.panel.class_cost_center_variance, accounting.panel.schedule, accounting.modal.create
 *   maintenance: wo.source.rs (road-service ticket flow is bill-only, no expense path exists)
 *   cash-flow: cash-flow.panel.projection · fuel: expense_mapping · home: role.accountant ·
 *   insurance: claims.create · reports: report.management · safety: external_fines.list ·
 *   vendors: detail.profile.default_expense_account, detail.profile.category_save
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RECORD_EXPENSE_MODAL = "apps/frontend/src/components/expenses/RecordExpenseModal.tsx";
const EXPENSES_LIST_PAGE = "apps/frontend/src/pages/accounting/ExpensesListPage.tsx";
const CREATE_WO_MODAL = "apps/frontend/src/pages/maintenance/components/CreateWorkOrderModal.tsx";
const CREATE_EXPENSE_MODAL = "apps/frontend/src/pages/maintenance/components/CreateExpenseModal.tsx";
const FILES = [RECORD_EXPENSE_MODAL, EXPENSES_LIST_PAGE, CREATE_WO_MODAL, CREATE_EXPENSE_MODAL];
const LABEL = "verify-expense-required-honest-batch1";
const SELFTEST = process.argv.includes("--selftest");

const REQUIRED_FILES = {
  accounting: "docs/specs/scoreboard/modules/accounting.required.json",
  maintenance: "docs/specs/scoreboard/modules/maintenance.required.json",
  "cash-flow": "docs/specs/scoreboard/modules/cash-flow.required.json",
  fuel: "docs/specs/scoreboard/modules/fuel.required.json",
  home: "docs/specs/scoreboard/modules/home.required.json",
  insurance: "docs/specs/scoreboard/modules/insurance.required.json",
  reports: "docs/specs/scoreboard/modules/reports.required.json",
  safety: "docs/specs/scoreboard/modules/safety.required.json",
  vendors: "docs/specs/scoreboard/modules/vendors.required.json",
};

const DROPPED = [
  ["accounting", "bills.create.vendor"],
  ["accounting", "accounting.panel.trk_bulk_register"],
  ["accounting", "accounting.panel.detail"],
  ["accounting", "accounting.panel.class_cost_center_variance"],
  ["accounting", "accounting.panel.schedule"],
  ["accounting", "accounting.modal.create"],
  ["maintenance", "wo.source.rs"],
  ["cash-flow", "cash-flow.panel.projection"],
  ["fuel", "expense_mapping"],
  ["home", "role.accountant"],
  ["insurance", "claims.create"],
  ["reports", "report.management"],
  ["safety", "external_fines.list"],
  ["vendors", "detail.profile.default_expense_account"],
  ["vendors", "detail.profile.category_save"],
];

const KEEP_REQUIRED = [
  ["accounting", "expenses.create"],
  ["maintenance", "wo.create"],
  ["maintenance", "wo.source.is"],
  ["maintenance", "wo.source.es"],
  ["maintenance", "wo.source.ac"],
  ["maintenance", "wo.source.et"],
  ["maintenance", "wo.source.rt"],
  ["maintenance", "wo.source.it"],
  ["maintenance", "wo.create_expense"],
  ["maintenance", "maintenance.modal.create_expense"],
];

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
}
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

export function assertExpenseBatch1(sources, docs) {
  const src = {};
  for (const rel of FILES) src[rel] = sources?.[rel] ?? read(rel);
  const problems = [];

  for (const [mod, id] of DROPPED) {
    const leaf = (docs[mod].leaves || []).find((l) => l.id === id);
    if (!leaf) { problems.push(`${mod}:${id} missing from required.json`); continue; }
    if ((leaf.required || []).includes("expense")) problems.push(`${mod}:${id} must not require expense`);
  }
  for (const [mod, id] of KEEP_REQUIRED) {
    const leaf = (docs[mod].leaves || []).find((l) => l.id === id);
    if (!leaf) { problems.push(`${mod}:${id} missing from required.json`); continue; }
    if (!(leaf.required || []).includes("expense")) problems.push(`${mod}:${id} must keep expense`);
  }

  const recordModal = src[RECORD_EXPENSE_MODAL];
  const listPage = src[EXPENSES_LIST_PAGE];
  const woModal = src[CREATE_WO_MODAL];
  const expenseModal = src[CREATE_EXPENSE_MODAL];

  if (!/onCreated\?\.\(created\?\.targetId/.test(recordModal)) problems.push(`${RECORD_EXPENSE_MODAL}: onSubmitted must forward created.targetId to onCreated`);
  if (!/setHighlightedExpenseId\(expenseId\)/.test(listPage)) problems.push(`${EXPENSES_LIST_PAGE}: onCreated must set highlightedExpenseId`);
  if (!/setCreatedExpense\(/.test(woModal)) problems.push(`${CREATE_WO_MODAL}: must hold created expense in state`);
  if (!/kind="expense"/.test(woModal)) problems.push(`${CREATE_WO_MODAL}: must EntityLink kind=expense for the auto-created expense`);
  if (!/setCreatedExpenseId\(/.test(expenseModal)) problems.push(`${CREATE_EXPENSE_MODAL}: must hold created expense id in state`);
  if (!/kind="expense"/.test(expenseModal)) problems.push(`${CREATE_EXPENSE_MODAL}: must EntityLink kind=expense for the created expense`);

  return problems;
}

function selftest() {
  const good = {
    [RECORD_EXPENSE_MODAL]: `
      onSubmitted={(created) => {
        onCreated?.(created?.targetId ?? null);
        onClose();
      }}
    `,
    [EXPENSES_LIST_PAGE]: `
      onCreated={(expenseId) => { if (expenseId) setHighlightedExpenseId(expenseId); }}
    `,
    [CREATE_WO_MODAL]: `
      const [createdExpense, setCreatedExpense] = useState(null);
      if (expenseResult?.uuid) setCreatedExpense({ uuid: expenseResult.uuid });
      <EntityLink kind="expense" id={createdExpense.uuid} label="x" />
    `,
    [CREATE_EXPENSE_MODAL]: `
      const [createdExpenseId, setCreatedExpenseId] = useState(null);
      if (created?.targetId) { setCreatedExpenseId(created.targetId); }
      <EntityLink kind="expense" id={createdExpenseId} label="x" />
    `,
  };
  const docs = {};
  for (const [mod, rel] of Object.entries(REQUIRED_FILES)) docs[mod] = readJson(rel);

  const goodProblems = assertExpenseBatch1(good, docs);
  if (goodProblems.length) {
    console.error(`${LABEL} SELFTEST FAIL — known-good fixture flagged: ${goodProblems.join("; ")}`);
    process.exit(1);
  }

  let mutationCount = 0;
  const sourceMutations = [
    { ...good, [RECORD_EXPENSE_MODAL]: good[RECORD_EXPENSE_MODAL].replace("onCreated?.(created?.targetId ?? null);", "onCreated?.();") },
    { ...good, [EXPENSES_LIST_PAGE]: good[EXPENSES_LIST_PAGE].replace("setHighlightedExpenseId(expenseId)", "setHighlightedExpenseId(null)") },
    { ...good, [CREATE_WO_MODAL]: good[CREATE_WO_MODAL].replace("setCreatedExpense(", "setXxx(") },
    { ...good, [CREATE_WO_MODAL]: good[CREATE_WO_MODAL].replace('kind="expense"', "") },
    { ...good, [CREATE_EXPENSE_MODAL]: good[CREATE_EXPENSE_MODAL].replace("setCreatedExpenseId(", "setXxx(") },
    { ...good, [CREATE_EXPENSE_MODAL]: good[CREATE_EXPENSE_MODAL].replace('kind="expense"', "") },
  ];
  for (const mutated of sourceMutations) {
    mutationCount++;
    if (assertExpenseBatch1(mutated, docs).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — source mutation ${mutationCount} escaped detection`);
      process.exit(1);
    }
  }
  for (const [mod, id] of DROPPED) {
    mutationCount++;
    const mutatedDocs = structuredClone(docs);
    const leaf = mutatedDocs[mod].leaves.find((l) => l.id === id);
    leaf.required = [...new Set([...(leaf.required || []), "expense"])];
    if (assertExpenseBatch1(good, mutatedDocs).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — mutation escaped detection: re-add expense to ${mod}:${id}`);
      process.exit(1);
    }
  }
  for (const [mod, id] of KEEP_REQUIRED) {
    mutationCount++;
    const mutatedDocs = structuredClone(docs);
    const leaf = mutatedDocs[mod].leaves.find((l) => l.id === id);
    leaf.required = (leaf.required || []).filter((c) => c !== "expense");
    if (assertExpenseBatch1(good, mutatedDocs).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — mutation escaped detection: drop expense from ${mod}:${id}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutationCount} mutations all detected`);
  process.exit(0);
}

if (SELFTEST) selftest();

const liveDocs = {};
for (const [mod, rel] of Object.entries(REQUIRED_FILES)) liveDocs[mod] = readJson(rel);
const failures = assertExpenseBatch1(undefined, liveDocs);
if (failures.length) {
  console.error(`${LABEL} FAIL:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
