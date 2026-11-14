#!/usr/bin/env node
/**
 * verify-factoring-monthly-fee-drills — ROUND 8.20 board18.
 * Monthly fee + statement history chargeback/fee totals must drill Chargebacks & Fees
 * for that statement month (date_from/date_to) with ret.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-factoring-monthly-fee-drills";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOME = "apps/frontend/src/pages/factoring/FactoringHome.tsx";
const HELPER = "apps/frontend/src/pages/factoring/factoringMonthFeeDrill.ts";

export function check(homeSrc, helperSrc) {
  const f = [];
  if (!helperSrc) f.push("factoringMonthFeeDrill.ts missing");
  else {
    if (!/buildMonthlyFeeDrillHref/.test(helperSrc)) f.push("buildMonthlyFeeDrillHref missing");
    if (!/statementMonthBounds/.test(helperSrc)) f.push("statementMonthBounds missing");
    if (!/date_from=/.test(helperSrc) || !/date_to=/.test(helperSrc)) f.push("helper must emit date_from/date_to");
    if (!/chargebacks_fees|chargebacks-fees/.test(helperSrc)) f.push("helper must target chargebacks-fees tab");
    if (!/withReturnContext/.test(helperSrc)) f.push("helper must attach ret via withReturnContext");
  }
  if (!homeSrc) f.push("FactoringHome.tsx missing");
  else {
    if (!/buildMonthlyFeeDrillHref/.test(homeSrc)) f.push("FactoringHome must import buildMonthlyFeeDrillHref");
    if (!/buildMonthlyFeeColumns/.test(homeSrc)) f.push("buildMonthlyFeeColumns missing");
    if (!/buildStatementHistoryColumns/.test(homeSrc)) f.push("buildStatementHistoryColumns missing");
    if (/key: "chargeback_total"[\s\S]{0,120}fmtCurrency\(row\.chargeback_total\)/.test(homeSrc)) {
      f.push("monthly chargeback_total still plain fmtCurrency");
    }
    if (/key: "month_chargebacks_total"[\s\S]{0,160}fmtCurrency\(row\.month_chargebacks_total/.test(homeSrc)) {
      f.push("statement month_chargebacks_total still plain fmtCurrency");
    }
    if (!/factoring-monthly-fee-chargebacks-/.test(homeSrc)) f.push("monthly fee chargebacks test id missing");
    if (!/factoring-statement-fees-/.test(homeSrc)) f.push("statement fees test id missing");
  }
  return f;
}

function selftest(home, helper) {
  const cases = [
    ["no helper", home, ""],
    ["plain monthly", home.replace(/buildMonthlyFeeColumns[\s\S]*?function buildStatementHistoryColumns/, "function buildStatementHistoryColumns"), helper],
    ["no ret", home, helper.replace(/withReturnContext/g, "plainJoin")],
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

const homeSrc = fs.existsSync(path.join(ROOT, HOME)) ? fs.readFileSync(path.join(ROOT, HOME), "utf8") : "";
const helperSrc = fs.existsSync(path.join(ROOT, HELPER)) ? fs.readFileSync(path.join(ROOT, HELPER), "utf8") : "";
if (process.argv.includes("--selftest")) selftest(homeSrc, helperSrc);
else {
  const f = check(homeSrc, helperSrc);
  if (f.length) {
    for (const x of f) console.error(`${LABEL}: FAIL — ${x}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — monthly fee / statement totals drill chargebacks-fees with ret`);
}
