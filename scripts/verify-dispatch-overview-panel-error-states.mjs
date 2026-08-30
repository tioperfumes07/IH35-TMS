#!/usr/bin/env node
/**
 * GUARD: dispatch DispatchOverview.tsx's five DataPanel queries (round-trip exposure, at-risk
 * queue, detention board, border crossings, out-of-service) must each render a real error state
 * on failure, never let a failed fetch masquerade as "nothing to review".
 *
 * ROOT CAUSE this freezes shut: exposureLoadsQ, atRiskQ, detentionQ, borderQ, and oosLoadsQ each
 * checked .isLoading in their panel render but never .isError — while the SAME file's KPI tiles
 * (dashboardQ, atRiskQ+lateQ, unitsWithoutLoadQ) already gate on isError for their own values.
 * On fetch failure, `.data` stayed undefined, the `?? []` fallback fired, and each panel silently
 * rendered its "empty" copy ("No active detention events.", "No border crossings in the last 7
 * days.", etc.) — indistinguishable from a genuinely quiet dispatcher day, on a home dashboard
 * where a dispatcher decides whether anything needs review.
 *
 * Static-only (text-pattern) check against the real component file: each of the five queries'
 * panel render must show `<query>.isLoading ? ... : <query>.isError ? PanelError(...)` before its
 * existing empty-state check (window sizes measured directly against the real file: all five
 * pairs 66-73 / 32-39 actual chars, comfortably inside budget).
 *
 * Run:  node scripts/verify-dispatch-overview-panel-error-states.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE_PATH = path.join(root, "apps/frontend/src/pages/dispatch/DispatchOverview.tsx");
const LABEL = "verify-dispatch-overview-panel-error-states";

const QUERIES = ["exposureLoadsQ", "atRiskLateQ", "detentionQ", "borderQ", "oosLoadsQ"];

export function checkDispatchOverviewPanelErrorStates(src) {
  const problems = [];

  for (const q of QUERIES) {
    const loadIdx = src.indexOf(`{${q}.isLoading ?`);
    if (loadIdx === -1) {
      problems.push(`${q}'s panel render block (\`{${q}.isLoading ?\`) not found — file structure changed unexpectedly`);
      continue;
    }
    const errRe = new RegExp(`\\{${q}\\.isLoading \\?[\\s\\S]{0,150}${q}\\.isError \\?[\\s\\S]{0,100}PanelError\\(`);
    if (!errRe.test(src.slice(loadIdx, loadIdx + 400))) {
      problems.push(
        `${q}'s panel does not gate PanelError() on ${q}.isError before its empty-state check — a failed fetch renders identically to a genuinely empty panel`
      );
    }
  }

  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];

  const bad = `
    {exposureLoadsQ.isLoading ? (<PanelLoading />) : exposureLoads.length === 0 ? (PanelEmpty("x")) : (rows)}
    {atRiskLateQ.isLoading ? (<PanelLoading />) : atRiskLoads.length === 0 ? (PanelEmpty("x")) : (rows)}
    {detentionQ.isLoading ? (<PanelLoading />) : detentionEvents.length === 0 ? (PanelEmpty("x")) : (rows)}
    {borderQ.isLoading ? (<PanelLoading />) : borderEvents.length === 0 ? (PanelEmpty("x")) : (rows)}
    {oosLoadsQ.isLoading ? (<PanelLoading />) : oosLoads.length === 0 ? (PanelEmpty("x")) : (rows)}
  `;
  const badProblems = checkDispatchOverviewPanelErrorStates(bad);
  if (badProblems.length !== 5) {
    failures.push(
      `the real pre-fix defect verbatim expected 5 problems, got ${badProblems.length}: ${badProblems.join("; ")}`
    );
  }

  const good = fs.readFileSync(FILE_PATH, "utf8");
  const goodProblems = checkDispatchOverviewPanelErrorStates(good);
  if (goodProblems.length !== 0) {
    failures.push(`the real fixed file was flagged: ${goodProblems.join("; ")}`);
  }

  // Partial fix: only exposureLoadsQ fixed, the other four still not — proves independence.
  const partial = bad.replace(
    '{exposureLoadsQ.isLoading ? (<PanelLoading />) : exposureLoads.length === 0 ? (PanelEmpty("x")) : (rows)}',
    'function PanelError(m, r) { return null; }\n{exposureLoadsQ.isLoading ? (<PanelLoading />) : exposureLoadsQ.isError ? PanelError("x", r) : exposureLoads.length === 0 ? (PanelEmpty("x")) : (rows)}'
  );
  const partialProblems = checkDispatchOverviewPanelErrorStates(partial);
  if (partialProblems.length !== 4) {
    failures.push(
      `a partial fix (one of five panels scoped) expected 4 problems, got ${partialProblems.length}: ${partialProblems.join("; ")}`
    );
  }

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST OK — the real pre-fix defect caught (5/5), the real fixed file clears, a ` +
      `partial fix (one of five) caught (4/4).`
  );
  process.exit(0);
}

const src = fs.readFileSync(FILE_PATH, "utf8");
const problems = checkDispatchOverviewPanelErrorStates(src);
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} problem(s):`);
  for (const p of problems) console.error("  ✗ " + p);
  process.exit(1);
}
console.log(
  `${LABEL} OK — DispatchOverview.tsx's five panel queries (exposure, at-risk, detention, border, out-of-service) all render real error states on failure.`
);
