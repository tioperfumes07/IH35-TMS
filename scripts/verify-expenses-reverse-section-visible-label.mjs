#!/usr/bin/env node
/**
 * verify-expenses-reverse-section-visible-label.mjs (TRAILER-EXPENSE-REVERSE-LABEL-NOT-VISIBLE)
 *
 * Root cause: `ExpensesReverseSection.tsx` (shared by TrailerProfilePage, VehicleProfilePage,
 * DriverProfilePage, LoadDetailDrawer, WorkOrderDetailPage, ClaimsTab — the reverse-link expense
 * list) rendered each row's OWN label via `entityLabel(row.expense_number, row.id, "Expense")`.
 * `entityLabel`'s "Expense — not visible" fallback exists for an id whose entity failed to
 * resolve via a join — it is the wrong semantics for a row that is ALREADY fetched and rendering
 * on screen with real date/amount/status/vendor data next to it. A genuinely-visible expense with
 * no expense_number rendered the self-contradictory "Expense — not visible" even though the row
 * — and its reverse link — were both correct and live (confirmed on trailer USMCA-T01,
 * expense b6214923-…, GUARD-WORKORDERS.md).
 *
 * Fix: use `visibleDocumentLabel()` — the helper the codebase already has for exactly this
 * "visible list/register row, never claim not-visible" class (entity-label.ts's own doc comment;
 * same pattern already used in ManualJEListPage.tsx / DriverEscrowTabContent.tsx / others) — with
 * a fallback chain through the row's own memo/line_description/vendor_name before the bare noun.
 *
 * Usage:
 *   node scripts/verify-expenses-reverse-section-visible-label.mjs            # scan
 *   node scripts/verify-expenses-reverse-section-visible-label.mjs --selftest # regression harness
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const FILE = "apps/frontend/src/components/accounting/ExpensesReverseSection.tsx";

const IMPORTS_HELPER_RE = /import\s*\{[^}]*\bvisibleDocumentLabel\b[^}]*\}\s*from\s*["']\.\.\/\.\.\/lib\/entity-label["']/;
const NOT_VISIBLE_CALL_RE = /EntityLink\s+kind="expense"[\s\S]{0,400}?entityLabel\(row\.expense_number/;
const USES_HELPER_RE = /label=\{visibleDocumentLabel\(\s*row\.expense_number\s*\?\?\s*row\.memo\s*\?\?\s*row\.line_description\s*\?\?\s*row\.vendor_name,\s*\n?\s*row\.id,\s*\n?\s*"Expense"\s*\)\}/;

export function checkExpensesReverseSectionVisibleLabel(src) {
  const offenders = [];
  if (!IMPORTS_HELPER_RE.test(src)) {
    offenders.push(`${FILE}: does not import visibleDocumentLabel from ../../lib/entity-label — TRAILER-EXPENSE-REVERSE-LABEL-NOT-VISIBLE regression.`);
  }
  if (NOT_VISIBLE_CALL_RE.test(src)) {
    offenders.push(`${FILE}: the expense row's own label still calls entityLabel(row.expense_number, ...) — a null expense_number will render "Expense — not visible" on a genuinely visible row again.`);
  }
  if (!USES_HELPER_RE.test(src)) {
    offenders.push(`${FILE}: the expense row's own label is not wired to visibleDocumentLabel() with the expense_number -> memo -> line_description -> vendor_name fallback chain.`);
  }
  return offenders;
}

export function run() {
  const src = fs.readFileSync(path.join(repoRoot, FILE), "utf8");
  const offenders = checkExpensesReverseSectionVisibleLabel(src);
  return { ok: offenders.length === 0, offenders };
}

if (process.argv.includes("--selftest")) {
  const buggy = `
    import { entityLabel } from "../../lib/entity-label";
    export function ExpensesReverseSection() {
      return (
        <li>
          <EntityLink kind="expense" id={row.id} label={entityLabel(row.expense_number, row.id, "Expense")} className="font-medium" />
        </li>
      );
    }
  `;
  const fixed = fs.readFileSync(path.join(repoRoot, FILE), "utf8");

  const buggyOffenders = checkExpensesReverseSectionVisibleLabel(buggy);
  const fixedOffenders = checkExpensesReverseSectionVisibleLabel(fixed);

  if (buggyOffenders.length >= 1 && fixedOffenders.length === 0) {
    console.log("verify-expenses-reverse-section-visible-label selftest OK");
    process.exit(0);
  }
  console.error("verify-expenses-reverse-section-visible-label selftest FAILED", { buggyOffenders, fixedOffenders });
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { ok, offenders } = run();
  if (!ok) {
    console.error(
      "verify-expenses-reverse-section-visible-label FAIL:\n  " + offenders.map((o) => "✗ " + o).join("\n  "),
    );
    process.exit(1);
  }
  console.log(
    "verify-expenses-reverse-section-visible-label OK — the reverse-link expense row's own label uses visibleDocumentLabel() with a real-field fallback chain, never entityLabel's not-visible tombstone",
  );
}
