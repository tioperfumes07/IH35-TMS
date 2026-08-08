#!/usr/bin/env node
/**
 * GUARD: a bill line's expense CATEGORY must never fall back to a GL ACCOUNT id.
 *
 * ACCT-F194. `accounting/bills.service.ts` bound the bill_lines insert as
 *
 *     line.expenseCategoryUuid ?? accountId
 *
 * so whenever a caller supplied no category, a `catalogs.accounts` id was written into
 * `expense_category_uuid`, a column that must hold a `catalogs.expense_categories` id.
 *
 * WHY THAT IS A MONEY DEFECT AND NOT A TYPING NICETY: the poster resolves categories through
 * expense_category_account_map, KEYED ON A CATEGORY UUID. An account id there matches nothing, so
 * the expense is SILENTLY UNCATEGORIZED — no error, no log, a P&L line that simply never lands in
 * its category. Measured on prod: 4 of the 15 populated rows were account ids, every one exactly
 * equal to the row's own account_id, and THREE were written on 2026-08-07 — the board card had it
 * as a single legacy row from 07-22 and called it "minor-structural".
 *
 * NULL is the honest value for "no category supplied". Inventing one from an account is precisely
 * what made the defect invisible: the column looked populated, so nothing looked wrong.
 *
 * SCOPE: the assertion is narrow on purpose — it forbids ONE fallback in ONE binding. A broader
 * "no column may default to another column" rule would be unenforceable across this codebase and
 * would redden legitimate copies (invoice_type, created_by/updated_by both binding $14, and so on).
 *
 * Run:  node scripts/verify-billline-category-not-account-id.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVICE = "apps/backend/src/accounting/bills.service.ts";
const LABEL = "verify-billline-category-not-account-id";

const read = (rel) => {
  const p = path.join(root, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
};
const strip = (s) => s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

export function collectProblems(src) {
  if (src == null) return [`missing ${SERVICE}`];
  const code = strip(src);
  const problems = [];

  // The defect verbatim, in any spacing.
  if (/expenseCategoryUuid\s*\?\?\s*accountId/.test(code)) {
    problems.push(
      `${SERVICE} binds \`expenseCategoryUuid ?? accountId\` — a GL ACCOUNT id written into ` +
        `expense_category_uuid. expense_category_account_map is keyed on a CATEGORY uuid, so the ` +
        `expense resolves to nothing and is SILENTLY UNCATEGORIZED (ACCT-F194).`
    );
  }
  // Any fallback from the category to a non-null value is equally wrong; only null is honest.
  const bind = /expenseCategoryUuid\s*\?\?\s*([A-Za-z0-9_.]+)/.exec(code);
  if (bind && bind[1] !== "null") {
    problems.push(
      `${SERVICE} falls back from expenseCategoryUuid to \`${bind[1]}\`. The only honest value for ` +
        `"no category supplied" is null — anything else makes the column look populated and the ` +
        `miscategorisation invisible.`
    );
  }
  if (!/expenseCategoryUuid/.test(code)) {
    problems.push(`${SERVICE} no longer binds expenseCategoryUuid at all — re-verify the insert.`);
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const src = read(SERVICE);
  const baseline = collectProblems(src);
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL — clean tree is not green:`);
    for (const p of baseline) console.error("  - " + p);
    process.exit(1);
  }
  const failures = [];
  const mutations = [
    ["the ACCT-F194 defect verbatim", src.replace("line.expenseCategoryUuid ?? null", "line.expenseCategoryUuid ?? accountId")],
    ["a different non-null fallback", src.replace("line.expenseCategoryUuid ?? null", "line.expenseCategoryUuid ?? section")],
    ["binding removed entirely", src.replaceAll("expenseCategoryUuid", "gone")],
  ];
  for (const [why, mutated] of mutations) {
    if (mutated === src) failures.push(`${why} — MUTATION INERT (changed nothing)`);
    else if (collectProblems(mutated).length === 0) failures.push(`${why} — NOT DETECTED`);
  }
  // A comment naming the defect must not trip it — this fix ships with exactly such a comment.
  if (collectProblems("// expenseCategoryUuid ?? accountId was the bug\nconst x = 1;").length !== 1) {
    // one problem expected: "no longer binds expenseCategoryUuid" — NOT the fallback rule
    failures.push("comment stripping is wrong: a commented-out defect changed the verdict");
  }
  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const p of failures) console.error("  - " + p);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST OK — 4/4 (defect verbatim, any non-null fallback, binding removed, comments cannot fake it)`);
  process.exit(0);
}

const problems = collectProblems(read(SERVICE));
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} issue(s):`);
  for (const p of problems) console.error("  ✗ " + p);
  process.exit(1);
}
console.log(`${LABEL} OK — a bill line with no category is written NULL, never a GL account id.`);
