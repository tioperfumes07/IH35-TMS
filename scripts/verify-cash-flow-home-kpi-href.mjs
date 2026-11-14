#!/usr/bin/env node
/**
 * verify-cash-flow-home-kpi-href — ROUND 8.20 board5.
 * Cash Flow Home V3 KPIs must use shareable href= (cashFlowTabHref), not onClick-only.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-cash-flow-home-kpi-href";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TAB = "apps/frontend/src/pages/cash-flow/tabs/CashFlowHomeTab.tsx";
const HELPER = "apps/frontend/src/pages/cash-flow/tabs/cashFlowTabHref.ts";

export function check(homeSrc, helperSrc) {
  const f = [];
  if (!helperSrc) f.push("cashFlowTabHref.ts missing");
  else if (!/export function cashFlowTabHref/.test(helperSrc)) f.push("cashFlowTabHref helper missing");
  if (!homeSrc) f.push("CashFlowHomeTab.tsx missing");
  else {
    if (!/from "\.\/cashFlowTabHref"/.test(homeSrc) && !/from '\.\/cashFlowTabHref'/.test(homeSrc)) {
      f.push("CashFlowHomeTab must import cashFlowTabHref");
    }
    if (!/testId="cash-flow-home-v3-kpi-opening"[\s\S]{0,200}href=\{cashFlowTabHref\("rolling_ledger"/.test(homeSrc)) {
      f.push("opening KPI must href rolling_ledger via cashFlowTabHref");
    }
    if (!/testId="cash-flow-home-v3-kpi-income"[\s\S]{0,160}href=\{cashFlowTabHref\("daily_prediction"\)/.test(homeSrc)) {
      f.push("income KPI must href daily_prediction");
    }
    if (!/testId="cash-flow-home-v3-kpi-runrate"[\s\S]{0,200}href=\{cashFlowTabHref\("actual_vs_projected"\)/.test(homeSrc)) {
      f.push("run-rate KPI must href actual_vs_projected");
    }
    if (!/testId="cash-flow-home-v3-kpi-4w"[\s\S]{0,280}rl_kind:\s*"income"/.test(homeSrc)) {
      f.push("4w KPI must pass rl_kind income");
    }
    if (/testId="cash-flow-home-v3-kpi-opening"[\s\S]{0,220}onClick=\{\(\) =>/.test(homeSrc)) {
      f.push("opening KPI still onClick-only");
    }
  }
  return f;
}

function selftest(home, helper) {
  const cases = [
    ["no helper", home, ""],
    ["onClick opening", home.replace(/href=\{cashFlowTabHref\("rolling_ledger", \{ rl_from: today, rl_to: addDaysIso\(today, 13\) \}\)/, 'onClick={() => openSibling("rolling_ledger")}'), helper],
    ["no income href", home.replace(/href=\{cashFlowTabHref\("daily_prediction"\)\}/g, "onClick={() => {}}"), helper],
  ];
  let pass = check(home, helper).length === 0 ? 1 : 0;
  if (!pass) console.error(`${LABEL} --selftest: live tree fails`, check(home, helper));
  for (const [name, h, hp] of cases) {
    if (check(h, hp).length > 0) pass += 1;
    else console.error(`${LABEL} --selftest: did not catch "${name}"`);
  }
  const total = cases.length + 1;
  if (pass !== total) {
    console.error(`${LABEL} --selftest FAIL ${pass}/${total}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS ${pass}/${total}`);
}

const homeSrc = fs.existsSync(path.join(ROOT, TAB)) ? fs.readFileSync(path.join(ROOT, TAB), "utf8") : "";
const helperSrc = fs.existsSync(path.join(ROOT, HELPER)) ? fs.readFileSync(path.join(ROOT, HELPER), "utf8") : "";
if (process.argv.includes("--selftest")) selftest(homeSrc, helperSrc);
else {
  const f = check(homeSrc, helperSrc);
  if (f.length) {
    for (const x of f) console.error(`${LABEL}: FAIL — ${x}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — Cash Flow Home KPIs use cashFlowTabHref`);
}
