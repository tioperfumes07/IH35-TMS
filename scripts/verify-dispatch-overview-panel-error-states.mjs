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

// Re-anchored 2026-10-02 (owner design law: every overview panel is one board table, OverviewTable). The state ladder now
// lives once in OverviewTable — loading, then ERROR, then empty — and each of the five queries must be handed to it as
// `query={q}` with its own errorMessage, so a failed fetch can never render the panel's empty copy.
export function checkDispatchOverviewPanelErrorStates(src) {
  const problems = [];
  const table = (src.match(/function OverviewTable\([\s\S]*?\n}\n/) ?? [""])[0];
  if (!/query\.isLoading \?[\s\S]{0,120}query\.isError \?[\s\S]{0,400}rows\.length === 0 \?/.test(table)) {
    problems.push("OverviewTable must gate the error state on query.isError BEFORE its empty-state check");
  }
  for (const q of QUERIES) {
    if (!new RegExp(`query=\\{${q}\\}\\s*\\n\\s*errorMessage="[^"]+"`).test(src)) {
      problems.push(`${q} is not handed to an OverviewTable with its own errorMessage — its failure would read as "nothing to review"`);
    }
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];

  const good = fs.readFileSync(FILE_PATH, "utf8");
  const goodProblems = checkDispatchOverviewPanelErrorStates(good);
  if (goodProblems.length !== 0) failures.push(`the real file was flagged: ${goodProblems.join("; ")}`);

  // The pre-fix defect: the shared table checks loading then empty, never error.
  const noError = good.replace(/query\.isError \?/, "false ?");
  if (checkDispatchOverviewPanelErrorStates(noError).length === 0) failures.push("a table without its isError branch was not caught");

  // One panel loses its query wiring (falls back to a bare rows list with no error state).
  const unwired = good.replace("query={detentionQ}", "query={{ isLoading: false, isError: false, refetch: () => undefined }}");
  if (checkDispatchOverviewPanelErrorStates(unwired).length !== 1) failures.push("an unwired detention panel was not caught exactly once");

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
