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
 *     expenseListLabel (document # or "No expense #") -- never a raw uuid and never a false
 *     "Expense — not visible" tombstone on a row the operator is looking at.
 *   - expenses.detail (ExpenseDetailPage.tsx): the page's own canonical identity resolved via
 *     expenseListLabel -- a detail page does not self-link; empty numbers say "No expense #".
 *
 * Two SIBLING leaves on the same pages were investigated and were false-Required for gl_je
 * (LV-MATRIX-THREE-HONEST-BUILT-GAPS / Box3 floor 2026-08-17):
 *   - accounting.panel.trk_bulk_register — Register writes fixed_assets only (no JE); depreciation JE
 *     is sibling accounting.panel.detail (already Built).
 *   - accounting.modal.create — create-before-post; sibling schedule already has JE links.
 * This guard ratchets that those two leaves MUST NOT Require gl_je, and that honesty_audit
 * box3_gl_je_2026_08_17 records the drops. Also ratchets drivers.panel.auto_deduction_policies
 * MUST NOT Require liability (no liability_id FK; policy ≠ driver_liabilities).
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
  accountingRequired: "docs/specs/scoreboard/modules/accounting.required.json",
  driversRequired: "docs/specs/scoreboard/modules/drivers.required.json",
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
  if (!/EntityLink kind="expense"[\s\S]{0,20}id=\{r\.id\}[\s\S]{0,80}expenseListLabel\(r\.expense_number\)/.test(expensesList)) {
    failures.push(`${FILES.expensesList}: list row must EntityLink kind="expense" with expenseListLabel (visible row, not tombstone)`);
  }
  if (!/No expense #/.test(expensesList) || !/humanMemo\(/.test(expensesList)) {
    failures.push(`${FILES.expensesList}: must keep No expense # + humanMemo for empty numbers / JE UUID memos`);
  }

  const expensesDetail = read(FILES.expensesDetail);
  if (!/expenseListLabel\(expense\.expense_number\)/.test(expensesDetail)) {
    failures.push(`${FILES.expensesDetail}: detail page must resolve its own identity via expenseListLabel (visible expense, not tombstone)`);
  }

  // Guard against re-inflation: the two sibling leaves this PR deliberately did NOT tag must stay
  // genuinely untagged evidence -- if a future change adds real gl_je evidence there, this check
  // simply stops failing (no action needed); it exists to catch this file's OWN header comment
  // going stale if that evidence disappears from the real files without anyone updating the note.
  const fixedAssetsRoute = read(FILES.fixedAssetsRoute);
  if (!/Register writes accounting\.fixed_assets rows only \(no JE\)/.test(fixedAssetsRoute)) {
    failures.push(`${FILES.fixedAssetsRoute}: expected the TRK bulk register route to still document its no-JE design honestly`);
  }

  // Box3 floor — honesty-drop ratchet (LV-MATRIX-THREE-HONEST-BUILT-GAPS)
  try {
    const acct = JSON.parse(read(FILES.accountingRequired));
    const byId = Object.fromEntries((acct.leaves || []).map((l) => [l.id, l]));
    for (const id of ["accounting.panel.trk_bulk_register", "accounting.modal.create"]) {
      const req = byId[id]?.required || [];
      if (req.includes("gl_je")) {
        failures.push(`${FILES.accountingRequired}: ${id} must NOT Require gl_je (Box3 honesty-drop — no JE on this leaf)`);
      }
    }
    const drops = acct.honesty_audit?.box3_gl_je_2026_08_17?.drops || [];
    if (!drops.some((d) => d.id === "accounting.panel.trk_bulk_register" && (d.removed || []).includes("gl_je"))) {
      failures.push(`${FILES.accountingRequired}: honesty_audit.box3_gl_je_2026_08_17 must record trk_bulk_register gl_je drop`);
    }
    if (!drops.some((d) => d.id === "accounting.modal.create" && (d.removed || []).includes("gl_je"))) {
      failures.push(`${FILES.accountingRequired}: honesty_audit.box3_gl_je_2026_08_17 must record modal.create gl_je drop`);
    }

    const drivers = JSON.parse(read(FILES.driversRequired));
    const dById = Object.fromEntries((drivers.leaves || []).map((l) => [l.id, l]));
    const polReq = dById["drivers.panel.auto_deduction_policies"]?.required || [];
    if (polReq.includes("liability")) {
      failures.push(`${FILES.driversRequired}: drivers.panel.auto_deduction_policies must NOT Require liability (no liability_id FK)`);
    }
    const liabDrops = drivers.honesty_audit?.box3_liability_2026_08_17?.drops || [];
    if (!liabDrops.some((d) => d.id === "drivers.panel.auto_deduction_policies" && (d.removed || []).includes("liability"))) {
      failures.push(`${FILES.driversRequired}: honesty_audit.box3_liability_2026_08_17 must record auto_deduction_policies liability drop`);
    }
  } catch (e) {
    failures.push(`Box3 required.json parse/assert failed: ${e instanceof Error ? e.message : String(e)}`);
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
      mutate: (s) => s.replace('<EntityLink kind="expense" id={r.id} label={expenseListLabel(r.expense_number)} />', "null"),
    },
    {
      name: "expenses detail drops its own identity resolution",
      file: FILES.expensesDetail,
      mutate: (s) => s.replaceAll("expenseListLabel(expense.expense_number)", '"Expense"'),
    },
    {
      name: "trk_bulk_register falsely Requires gl_je again",
      file: FILES.accountingRequired,
      mutate: (s) => {
        const j = JSON.parse(s);
        const leaf = j.leaves.find((l) => l.id === "accounting.panel.trk_bulk_register");
        if (!leaf.required.includes("gl_je")) leaf.required.push("gl_je");
        return `${JSON.stringify(j, null, 2)}\n`;
      },
    },
    {
      name: "modal.create falsely Requires gl_je again",
      file: FILES.accountingRequired,
      mutate: (s) => {
        const j = JSON.parse(s);
        const leaf = j.leaves.find((l) => l.id === "accounting.modal.create");
        if (!leaf.required.includes("gl_je")) leaf.required.push("gl_je");
        return `${JSON.stringify(j, null, 2)}\n`;
      },
    },
    {
      name: "auto_deduction_policies falsely Requires liability again",
      file: FILES.driversRequired,
      mutate: (s) => {
        const j = JSON.parse(s);
        const leaf = j.leaves.find((l) => l.id === "drivers.panel.auto_deduction_policies");
        if (!leaf.required.includes("liability")) leaf.required.push("liability");
        return `${JSON.stringify(j, null, 2)}\n`;
      },
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
