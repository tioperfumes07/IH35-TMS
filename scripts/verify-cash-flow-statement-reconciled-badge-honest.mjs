#!/usr/bin/env node
/**
 * GUARD: reports CashFlowStatementPage.tsx's "Reconciliation" badge (on-screen AND print/export)
 * must go amber/"needs attention" when there are unclassified legs, never show a plain green
 * "Reconciled" while legs were silently defaulted into Operating.
 *
 * ROOT CAUSE this freezes shut: `reconciled` (backend, cash-flow.service.ts) is a pure arithmetic
 * tie-out check (`netCashChange === cashAtEnd - cashAtStart`) — it says nothing about whether
 * every leg was correctly classified into Operating/Investing/Financing. Because an unclassified
 * leg still gets bucketed (into Operating, by default) and its dollar amount still counted, the
 * tie-out is true almost by construction even when legs couldn't be classified. Live-observed on
 * USMCA: "Reconciled" (green) shown with "Unclassified legs: 10" in a tiny gray caption directly
 * beneath it — a real false all-clear on a financial report, same defect class as the .isError
 * gaps fixed repeatedly this session, just expressed as a badge-color/label bug. The print/export
 * HTML path was worse: it didn't even show the unclassified count at all.
 *
 * Static-only (text-pattern) check against the real component file, four independent parts
 * (window sizes measured directly against the real file, all with headroom):
 *   1. On-screen badge color condition includes `unclassified_leg_count === 0`.
 *   2. On-screen badge shows a distinct "Reconciled — unclassified legs" label when count > 0.
 *   3. On-screen caption explains the default-Operating bucketing when count > 0.
 *   4. Print/export HTML shows an "Unclassified legs" row and branches its Reconciliation text
 *      the same way as the on-screen badge.
 *
 * Run:  node scripts/verify-cash-flow-statement-reconciled-badge-honest.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE_PATH = path.join(root, "apps/frontend/src/pages/reports/CashFlowStatementPage.tsx");
const LABEL = "verify-cash-flow-statement-reconciled-badge-honest";

const ONSCREEN_RE =
  /query\.data\.unclassified_leg_count === 0[\s\S]{0,400}Reconciliation<\/div>[\s\S]{0,400}Reconciled — unclassified legs[\s\S]{0,400}bucketed into Operating by default/;
const PRINT_RE =
  /<tr><th>Reconciliation<\/th>[\s\S]{0,400}data\.unclassified_leg_count > 0[\s\S]{0,300}<tr><th>Unclassified legs<\/th>/;

export function checkCashFlowStatementBadge(src) {
  const problems = [];

  if (!ONSCREEN_RE.test(src)) {
    problems.push(
      "the on-screen Reconciliation badge does not go amber and show a distinct label when unclassified_leg_count > 0 — a plain green 'Reconciled' can still be shown while legs were silently defaulted into Operating"
    );
  }

  if (!PRINT_RE.test(src)) {
    problems.push(
      "the print/export HTML Reconciliation row does not branch on unclassified_leg_count and/or is missing its own 'Unclassified legs' row — the printed/exported report can misrepresent the reconciliation as clean, and previously omitted the unclassified count entirely"
    );
  }

  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];

  const bad = `
    <tr><th>Reconciliation</th><td>\${esc(data.reconciled ? "Reconciled" : "Needs review")}</td></tr>
    <div className={\`rounded-sm border bg-white px-3 py-2 \${query.data.reconciled ? "border-emerald-200" : "border-amber-300"}\`}>
      <div className="text-[11px] font-semibold uppercase text-gray-500">Reconciliation</div>
      <div className={\`text-lg font-semibold \${query.data.reconciled ? "text-emerald-700" : "text-amber-700"}\`}>
        {query.data.reconciled ? "Reconciled" : "Needs review"}
      </div>
      <div className="text-[11px] text-gray-500">Unclassified legs: {query.data.unclassified_leg_count}</div>
    </div>
  `;
  const badProblems = checkCashFlowStatementBadge(bad);
  if (badProblems.length !== 2) {
    failures.push(
      `the real pre-fix defect verbatim expected 2 problems, got ${badProblems.length}: ${badProblems.join("; ")}`
    );
  }

  const good = fs.readFileSync(FILE_PATH, "utf8");
  const goodProblems = checkCashFlowStatementBadge(good);
  if (goodProblems.length !== 0) {
    failures.push(`the real fixed file was flagged: ${goodProblems.join("; ")}`);
  }

  // Partial regression: print fixed, on-screen still not — proves the two checks are independent.
  const partial = bad.replace(
    '<tr><th>Reconciliation</th><td>${esc(data.reconciled ? "Reconciled" : "Needs review")}</td></tr>',
    '<tr><th>Reconciliation</th><td>${esc(!data.reconciled ? "Needs review" : data.unclassified_leg_count > 0 ? "Reconciled — unclassified legs" : "Reconciled")}</td></tr>\n    <tr><th>Unclassified legs</th><td>${esc(String(data.unclassified_leg_count))}</td></tr>'
  );
  const partialProblems = checkCashFlowStatementBadge(partial);
  if (partialProblems.length !== 1) {
    failures.push(
      `a partial fix (print row fixed, on-screen badge still not) expected 1 problem, got ${partialProblems.length}: ${partialProblems.join("; ")}`
    );
  }

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST OK — the real pre-fix defect caught (2/2), the real fixed file clears, a ` +
      `partial fix (print only) caught (1/1).`
  );
  process.exit(0);
}

const src = fs.readFileSync(FILE_PATH, "utf8");
const problems = checkCashFlowStatementBadge(src);
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} problem(s):`);
  for (const p of problems) console.error("  ✗ " + p);
  process.exit(1);
}
console.log(
  `${LABEL} OK — CashFlowStatementPage.tsx's Reconciliation badge (on-screen and print/export) honestly reflects unclassified legs instead of a false all-clear.`
);
