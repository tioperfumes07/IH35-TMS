#!/usr/bin/env node
/**
 * verify-daily-prediction-formula-drills — ROUND 8.20 board5/CF.
 * Daily Prediction formula strip + View all must drill Bank Accounts / RL cohorts with ret.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-daily-prediction-formula-drills";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TAB = "apps/frontend/src/pages/cash-flow/tabs/DailyPredictionTab.tsx";

export function check(src) {
  const f = [];
  if (!src) return ["DailyPredictionTab.tsx missing"];
  if (!/dailyPredictionRlHref/.test(src)) f.push("dailyPredictionRlHref helper missing");
  if (!/withReturnContext/.test(src)) f.push("must use withReturnContext");
  if (!/BANKING_TAB_PATH\.bank_accounts/.test(src)) f.push("opening/closing must target bank_accounts");
  if (!/cash-flow-projected-opening-drill/.test(src)) f.push("opening drill test id missing");
  if (!/cash-flow-projected-net-drill/.test(src)) f.push("net drill test id missing");
  if (!/cash-flow-projected-closing-drill/.test(src)) f.push("closing drill test id missing");
  if (/onViewAll=\{\(\) => navigate\("\/cash-flow\?tab=rolling_ledger"\)\}/.test(src)) {
    f.push("View all still bare rolling_ledger without ret/range");
  }
  if (!/dailyPredictionRlHref\(rangeFrom, rangeTo, "income"\)/.test(src)) {
    f.push("income View all must pass income kind + range");
  }
  if (!/dailyPredictionRlHref\(rangeFrom, rangeTo, "expenses"\)/.test(src)) {
    f.push("expense View all must pass expenses kind + range");
  }
  return f;
}

function selftest(src) {
  const cases = [
    ["no helper", src.replace(/dailyPredictionRlHref/g, "noop")],
    ["no ret", src.replace(/withReturnContext/g, "plainJoin")],
    ["bare view all", src.replace(/withReturnContext\(dailyPredictionRlHref\(rangeFrom, rangeTo, "income"\), originHref\)/g, '"/cash-flow?tab=rolling_ledger"')],
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
  console.log(`${LABEL}: PASS — Daily Prediction formula/View-all drill with ret`);
}
