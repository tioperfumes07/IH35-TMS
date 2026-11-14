#!/usr/bin/env node
/**
 * verify-mdp-kpi-money-drills — ROUND 8.20 board8.
 * Manual Daily Projections V3 KPIs must drill (bank→Bank Accounts+ret; income/expense/net→cash_flow_manual).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-mdp-kpi-money-drills";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TAB = "apps/frontend/src/pages/cash-flow/tabs/ManualDailyProjectionsTab.tsx";

export function check(src) {
  const f = [];
  if (!src) return ["ManualDailyProjectionsTab.tsx missing"];
  if (!/withReturnContext/.test(src)) f.push("must use withReturnContext for bank KPI ret");
  if (!/BANKING_TAB_PATH\.bank_accounts/.test(src)) f.push("bank KPI must target BANKING_TAB_PATH.bank_accounts");
  if (!/resolveAmountRoute/.test(src)) f.push("income/expense/net must use resolveAmountRoute");
  if (!/cash_flow_manual/.test(src)) f.push("MDP cohort drills must use cash_flow_manual");
  if (!/href=\{banksQuery\.isError \? undefined : bankHref\}/.test(src) && !/href=\{[^}]*bankHref/.test(src)) {
    f.push("bank V3KpiTile must set href=bankHref");
  }
  if (!/testId="cash-flow-mdp-v3-kpi-income"[\s\S]{0,200}href=\{incomeRoute/.test(src) && !/href=\{incomeRoute/.test(src)) {
    f.push("income KPI href missing");
  }
  if (!/href=\{expenseRoute/.test(src)) f.push("expense KPI href missing");
  if (!/href=\{netRoute/.test(src)) f.push("net KPI href missing");
  if (!/href=\{incomeRoute/.test(src)) f.push("income KPI href missing");
  return f;
}

function selftest(src) {
  const cases = [
    ["no ret", src.replace(/withReturnContext/g, "plainJoin")],
    ["no bank accounts", src.replace(/BANKING_TAB_PATH\.bank_accounts/g, "BANKING_TAB_PATH.transactions")],
    ["no resolve", src.replace(/resolveAmountRoute/g, "noopRoute")],
  ];
  let pass = check(src).length === 0 ? 1 : 0;
  if (!pass) console.error(`${LABEL} --selftest: live tree fails`, check(src));
  for (const [name, s] of cases) {
    if (check(s).length > 0) pass += 1;
    else console.error(`${LABEL} --selftest: did not catch "${name}"`);
  }
  const total = cases.length + 1;
  if (pass !== total) {
    console.error(`${LABEL} --selftest FAIL ${pass}/${total}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS ${pass}/${total}`);
}

const src = fs.existsSync(path.join(ROOT, TAB)) ? fs.readFileSync(path.join(ROOT, TAB), "utf8") : "";
if (process.argv.includes("--selftest")) selftest(src);
else {
  const f = check(src);
  if (f.length) {
    for (const x of f) console.error(`${LABEL}: FAIL — ${x}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — MDP KPIs drill bank accounts / cash_flow_manual cohorts`);
}
