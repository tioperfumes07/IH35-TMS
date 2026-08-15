#!/usr/bin/env node
/**
 * @matrix-built {"modules":["accounting"],"cols":["gl_je"],"leafRe":"^accounting\\.panel\\.schedule$","task":"WIRE-HONEST-PREPAID-SCHEDULE-GL-JE"}
 * @matrix-built {"modules":["accounting"],"cols":["gl_je"],"leafRe":"^accounting\\.panel\\.leakage$","task":"WIRE-HONEST-REVENUE-LEAKAGE-GL-JE"}
 * @matrix-built {"modules":["accounting"],"cols":["expense"],"leafRe":"^expenses\\.(list|detail)$","task":"WIRE-HONEST-EXPENSES-LIST-DETAIL-EXPENSE-LINK"}
 *
 * The 74% "wire-only" Built figure on /program/matrix counts only genuine leaf-specific
 * @matrix-built tags -- not the coarser "fill" figure, which a cell can satisfy without one.
 * These four leaves were verified LIVE (2026-08-15) to already carry real evidence with zero
 * product change, and were simply never tagged:
 *   - accounting.panel.schedule (PrepaidExpensesPage.tsx schedule table + detail panel): real
 *     gated EntityLink kind="journal_entry" for posted_journal_entry_id / purchase_je_id.
 *   - accounting.panel.leakage (RevenueRecognitionPage.tsx LeakagePanel): real gated
 *     EntityLink kind="journal_entry" for row.earn_journal_entry_id, backed by
 *     revenue-leakage.service.ts.
 *   - expenses.list (ExpensesListPage.tsx): real per-row EntityLink kind="expense" with
 *     entityLabel(expense_number, id, "Expense") -- never a raw uuid.
 *   - expenses.detail (ExpenseDetailPage.tsx): the page's own canonical identity resolved via
 *     entityLabel(expense.expense_number, expense.id, "Expense") -- a detail page does not
 *     self-link, it resolves its own identity honestly, which is the correct evidence shape
 *     for a detail leaf (mirrors the list-vs-detail EntityLink-vs-entityLabel pattern used
 *     throughout this codebase's other verified leaves).
 *
 * Two SIBLING leaves on the same pages were investigated and deliberately NOT tagged here
 * because they are genuinely not built for gl_je, not merely undertagged:
 *   - accounting.panel.trk_bulk_register (FixedAssetsPage.tsx TrkBulkRegisterPanel): the route's
 *     own header comment states "Register writes accounting.fixed_assets rows only (no JE)" --
 *     no EntityLink kind="journal_entry" anywhere in the panel or its result summary.
 *   - accounting.modal.create (PrepaidExpensesPage.tsx CreateModal): the form itself renders
 *     "(GL posting GATED — flag OFF)" and contains no JE evidence at all.
 * Requiring gl_je on a pure CREATE action (before any posting can occur) is very likely a
 * Required-column-honesty issue on those two leaves, not a Built gap -- flagged for a separate
 * pass, not fixed here (scope discipline: this PR only adds tags for verified-real evidence).
 *
 * Usage: node scripts/verify-accounting-genuine-tagged-gl-je-expense.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-accounting-genuine-tagged-gl-je-expense";

const FILES = {
  prepaid: "apps/frontend/src/pages/accounting/PrepaidExpensesPage.tsx",
  revenue: "apps/frontend/src/pages/accounting/RevenueRecognitionPage.tsx",
  revenueService: "apps/backend/src/accounting/revenue-leakage.service.ts",
  expensesList: "apps/frontend/src/pages/accounting/ExpensesListPage.tsx",
  expensesDetail: "apps/frontend/src/pages/accounting/ExpenseDetailPage.tsx",
  fixedAssetsRoute: "apps/backend/src/accounting/fixed-assets.routes.ts",
};

export function checkAll(readFile) {
  const failures = [];
  const read = (rel) => {
    const src = readFile(rel);
    if (src === null) failures.push(`missing file: ${rel}`);
    return src ?? "";
  };

  const prepaid = read(FILES.prepaid);
  if (!/kind="journal_entry"[\s\S]{0,40}id=\{row\.posted_journal_entry_id\}/.test(prepaid)) {
    failures.push(`${FILES.prepaid}: schedule table must EntityLink kind="journal_entry" for row.posted_journal_entry_id`);
  }
  if (!/detail\.purchase_je_id\s*\?[\s\S]{0,150}kind="journal_entry"/.test(prepaid)) {
    failures.push(`${FILES.prepaid}: detail panel must gate a purchase-JE EntityLink on detail.purchase_je_id`);
  }

  const revenue = read(FILES.revenue);
  if (!/row\.earn_journal_entry_id\s*\?[\s\S]{0,150}kind="journal_entry"/.test(revenue)) {
    failures.push(`${FILES.revenue}: LeakagePanel must gate a JE EntityLink on row.earn_journal_entry_id`);
  }
  const revenueService = read(FILES.revenueService);
  if (!/earn_journal_entry_id/.test(revenueService)) {
    failures.push(`${FILES.revenueService}: must project earn_journal_entry_id for the leakage panel`);
  }

  const expensesList = read(FILES.expensesList);
  if (!/EntityLink kind="expense"[\s\S]{0,20}id=\{r\.id\}[\s\S]{0,60}entityLabel\(r\.expense_number, r\.id, "Expense"\)/.test(expensesList)) {
    failures.push(`${FILES.expensesList}: list row must EntityLink kind="expense" with entityLabel(expense_number, id, "Expense")`);
  }

  const expensesDetail = read(FILES.expensesDetail);
  if (!/entityLabel\(expense\.expense_number, expense\.id, "Expense"\)/.test(expensesDetail)) {
    failures.push(`${FILES.expensesDetail}: detail page must resolve its own identity via entityLabel(expense_number, id, "Expense")`);
  }

  // Guard against re-inflation: the two sibling leaves this PR deliberately did NOT tag must stay
  // genuinely untagged evidence -- if a future change adds real gl_je evidence there, this check
  // simply stops failing (no action needed); it exists to catch this file's OWN header comment
  // going stale if that evidence disappears from the real files without anyone updating the note.
  const fixedAssetsRoute = read(FILES.fixedAssetsRoute);
  if (!/Register writes accounting\.fixed_assets rows only \(no JE\)/.test(fixedAssetsRoute)) {
    failures.push(`${FILES.fixedAssetsRoute}: expected the TRK bulk register route to still document its no-JE design honestly`);
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const real = {};
  for (const [key, rel] of Object.entries(FILES)) {
    try {
      real[rel] = fs.readFileSync(path.join(ROOT, rel), "utf8");
    } catch {
      real[rel] = null;
    }
  }
  for (const [rel, src] of Object.entries(real)) {
    if (src === null) {
      console.error(`[${LABEL}] selftest FAIL: cannot read real file ${rel} to build fixtures from`);
      process.exit(1);
    }
  }

  const goodFailures = checkAll((rel) => real[rel] ?? null);
  if (goodFailures.length) {
    console.error(`[${LABEL}] selftest FAIL: current real files should pass every check — ${goodFailures.join("; ")}`);
    process.exit(1);
  }

  const mutations = [
    {
      name: "prepaid schedule JE link removed",
      file: FILES.prepaid,
      mutate: (s) => s.replace('kind="journal_entry"\n        id={row.posted_journal_entry_id}', 'kind="removed"\n        id={row.posted_journal_entry_id}'),
    },
    {
      name: "prepaid purchase JE gate removed",
      file: FILES.prepaid,
      mutate: (s) => s.replace("detail.purchase_je_id ? (", "false ? ("),
    },
    {
      name: "revenue leakage JE gate removed",
      file: FILES.revenue,
      mutate: (s) => s.replace("row.earn_journal_entry_id ? (", "false ? ("),
    },
    {
      name: "revenue leakage service drops earn_journal_entry_id",
      file: FILES.revenueService,
      mutate: (s) => s.replaceAll("earn_journal_entry_id", "removed_field"),
    },
    {
      name: "expenses list drops expense EntityLink",
      file: FILES.expensesList,
      mutate: (s) => s.replace('<EntityLink kind="expense" id={r.id} label={entityLabel(r.expense_number, r.id, "Expense")} />', "null"),
    },
    {
      name: "expenses detail drops its own identity resolution",
      file: FILES.expensesDetail,
      mutate: (s) => s.replace('entityLabel(expense.expense_number, expense.id, "Expense")', '"Expense"'),
    },
  ];

  for (const m of mutations) {
    const mutated = { ...real, [m.file]: m.mutate(real[m.file]) };
    const problems = checkAll((rel) => mutated[rel] ?? null);
    if (!problems.length) {
      console.error(`[${LABEL}] selftest FAIL: mutation "${m.name}" was not rejected`);
      process.exit(1);
    }
  }

  console.log(`[${LABEL}] selftest PASS — real files clean; ${mutations.length}/${mutations.length} independent mutations rejected`);
  process.exit(0);
}

const failures = checkAll((rel) => {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
});

if (failures.length) {
  console.error(`[${LABEL}] FAILED — ${failures.length} check(s) regressed:`);
  for (const f of failures) console.error("  ✗", f);
  process.exit(1);
}
console.log(`[${LABEL}] PASS — prepaid schedule + revenue leakage gl_je and expenses list/detail expense identity all genuinely wired`);
