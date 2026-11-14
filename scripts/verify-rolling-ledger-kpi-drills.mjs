#!/usr/bin/env node
/**
 * verify-rolling-ledger-kpi-drills — ROUND 8.20 board7.
 * Rolling Ledger V3 KPIs must drill Bank Accounts (+ret) or rl_kind/date cohorts.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-rolling-ledger-kpi-drills";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TAB = "apps/frontend/src/pages/cash-flow/tabs/RollingLedgerTab.tsx";

export function check(src) {
  const f = [];
  if (!src) return ["RollingLedgerTab.tsx missing"];
  if (!/rollingLedgerKpiHref/.test(src)) f.push("rollingLedgerKpiHref helper missing");
  if (!/BANKING_TAB_PATH\.bank_accounts/.test(src)) f.push("opening/closing must target bank_accounts");
  if (!/withReturnContext/.test(src)) f.push("bank KPI must use withReturnContext");
  if (!/rl_kind/.test(src) || !/kind: "income"/.test(src)) f.push("income KPI must set rl_kind=income");
  if (!/kind: "expenses"/.test(src)) f.push("expenses KPI must set rl_kind=expenses");
  if (!/testId="rolling-ledger-v3-kpi-income"[\s\S]{0,120}href=\{rollingLedgerKpiHref/.test(src) && !/href=\{rollingLedgerKpiHref\(\{ kind: "income"/.test(src)) {
    f.push("income KPI href missing");
  }
  if (!/href=\{withReturnContext\(BANKING_TAB_PATH\.bank_accounts/.test(src)) {
    f.push("opening/closing bank href missing");
  }
  if (!/href=\{rollingLedgerKpiHref\(\{ from: today, to: addDaysIso\(today, 9\)/.test(src)) {
    f.push("due-next-10 KPI href missing");
  }
  return f;
}

function selftest(src) {
  const cases = [
    ["no helper", src.replace(/rollingLedgerKpiHref/g, "noop")],
    ["no bank", src.replace(/BANKING_TAB_PATH\.bank_accounts/g, "BANKING_TAB_PATH.transactions")],
    ["no ret", src.replace(/withReturnContext/g, "plainJoin")],
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
  console.log(`${LABEL}: PASS — Rolling Ledger KPIs drill bank accounts / rl cohorts`);
}
