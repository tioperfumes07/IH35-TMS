#!/usr/bin/env node
// MDP-PANEL-PROPORTION — equal-height income/expense panels + KPI row + shared totals wiring.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tabPath = join(root, "apps/frontend/src/pages/cash-flow/tabs/ManualDailyProjectionsTab.tsx");
const tab = readFileSync(tabPath, "utf8");
const fail = (m) => {
  console.error(`FAIL verify-mdp-panel-proportion: ${m}`);
  process.exit(1);
};

// Equal-height side-by-side panels.
if (!/lg:grid-cols-2[\s\S]{0,40}items-stretch|items-stretch[\s\S]{0,40}lg:grid-cols-2/.test(tab)) {
  fail("panel grid must use lg:grid-cols-2 with items-stretch");
}
if (!/data-mdp-panels="equal-height"/.test(tab)) fail('must declare data-mdp-panels="equal-height"');
if (!/min-h-\[24rem\][\s\S]{0,40}flex-col/.test(tab) || !/h-full[\s\S]{0,60}min-h-\[24rem\]/.test(tab)) {
  fail("ProjectionPanel root must be h-full min-h-[24rem] flex flex-col");
}
if (!/data-mdp-panel-list=\{direction\}[\s\S]{0,80}flex-1 overflow-auto/.test(tab) &&
    !/flex-1 overflow-auto[\s\S]{0,80}data-mdp-panel-list=\{direction\}/.test(tab)) {
  fail("panel list area must be flex-1 overflow-auto (data-mdp-panel-list)");
}

// KPI row — uniform card height + slate tokens only (no amber/emerald).
if (!/data-mdp-kpi-row="true"/.test(tab)) fail('KPI row must declare data-mdp-kpi-row="true"');
if (!/min-h-\[5\.5rem\][\s\S]{0,120}data-mdp-kpi="income"/.test(tab) &&
    !/data-mdp-kpi="income"[\s\S]{0,120}min-h-\[5\.5rem\]/.test(tab)) {
  fail("KPI cards must use min-h-[5.5rem] uniform height");
}
if (/\b(text|bg|border)-(amber|emerald|yellow)-/.test(tab)) {
  fail("MDP KPI row must not introduce amber/emerald/yellow palette tokens");
}
if (!/data-mdp-kpi-total="income"[\s\S]{0,120}totalIncome/.test(tab) &&
    !/totalIncome[\s\S]{0,120}data-mdp-kpi-total="income"/.test(tab)) {
  fail("Expected Income KPI must render totalIncome from computeProjectionTotals");
}

// Shared totals wiring — KPI + panel header/footer all from parent computeProjectionTotals.
if (!/computeProjectionTotals\(entries\)/.test(tab)) fail("tab must compute totals via computeProjectionTotals(entries)");
if (!/panelTotalCents=\{totalIncome\}/.test(tab) || !/panelTotalCents=\{totalExpense\}/.test(tab)) {
  fail("panels must receive panelTotalCents from computeProjectionTotals destructuring");
}
if (!/data-mdp-header-total=\{direction\}[\s\S]{0,60}panelTotalCents/.test(tab)) {
  fail("panel header total must display panelTotalCents (same source as KPI)");
}
if (!/data-mdp-footer-total=\{direction\}[\s\S]{0,60}panelTotalCents/.test(tab)) {
  fail("panel footer total must display panelTotalCents (same source as KPI)");
}

// Pull/create must invalidate entries cache so both panels refresh together.
if (!/invalidateQueries\(\{ queryKey: \["forecast", "entries"/.test(tab)) {
  fail("must invalidate forecast entries query after mutations");
}
if (!/pullMutation = useMutation\([\s\S]*onSuccess:[\s\S]*invalidateQueries[\s\S]*onError:[\s\S]*invalidateQueries/.test(tab)) {
  fail("pullMutation must invalidate entries on both onSuccess and onError (GO-0042)");
}

function layoutProblems(src) {
  const problems = [];
  if (!/items-stretch/.test(src)) problems.push("missing items-stretch");
  if (!/panelTotalCents=\{totalIncome\}/.test(src)) problems.push("missing panelTotalCents wiring");
  if (!/data-mdp-kpi-row="true"/.test(src)) problems.push("missing kpi row marker");
  return problems;
}

if (process.argv.includes("--selftest")) {
  const broken = tab
    .replace(/items-stretch/g, "")
    .replace(/panelTotalCents=\{totalIncome\}/g, "entries={income}")
    .replace(/data-mdp-kpi-row="true"/g, "");
  const planted = layoutProblems(broken);
  if (planted.length < 3) {
    console.error(`FAIL verify-mdp-panel-proportion SELFTEST: expected ≥3 planted problems, got ${planted.length}: ${planted.join("; ")}`);
    process.exit(1);
  }
  const live = layoutProblems(tab);
  if (live.length) {
    console.error(`FAIL verify-mdp-panel-proportion SELFTEST: live file missing: ${live.join("; ")}`);
    process.exit(1);
  }
  console.log("PASS verify-mdp-panel-proportion --selftest");
  process.exit(0);
}

console.log("PASS verify-mdp-panel-proportion");
