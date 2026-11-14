#!/usr/bin/env node
/**
 * verify-factoring-faro-import-money-drills — ROUND 8.20 board18.
 * Faro Daily Import money columns + summary KPIs must drill factoring cohorts
 * for the statement day/range with ret (not plain fmtCurrency).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-factoring-faro-import-money-drills";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOME = "apps/frontend/src/pages/factoring/FactoringHome.tsx";
const HELPER = "apps/frontend/src/pages/factoring/factoringFaroImportDrill.ts";

export function check(homeSrc, helperSrc) {
  const f = [];
  if (!helperSrc) f.push("factoringFaroImportDrill.ts missing");
  else {
    if (!/buildFaroImportDrillHref/.test(helperSrc)) f.push("buildFaroImportDrillHref missing");
    if (!/buildFaroImportRangeDrillHref/.test(helperSrc)) f.push("buildFaroImportRangeDrillHref missing");
    if (!/statementDayBounds/.test(helperSrc)) f.push("statementDayBounds missing");
    if (!/withReturnContext/.test(helperSrc)) f.push("helper must attach ret via withReturnContext");
    if (!/purchase_report|purchase-report/.test(helperSrc)) f.push("gross must target purchase-report");
    if (!/chargebacks_fees|chargebacks-fees/.test(helperSrc)) f.push("fee/chargeback must target chargebacks-fees");
    if (!/payments_to_you|payments-to-you/.test(helperSrc)) f.push("advance must target payments-to-you");
    if (!/escrow_account|escrow-account/.test(helperSrc)) f.push("reserve must target escrow-account");
  }
  if (!homeSrc) f.push("FactoringHome.tsx missing");
  else {
    if (!/buildFaroImportDrillHref/.test(homeSrc)) f.push("FactoringHome must import buildFaroImportDrillHref");
    if (!/buildFaroImportColumns/.test(homeSrc)) f.push("buildFaroImportColumns missing");
    if (!/faroImportColumns/.test(homeSrc)) f.push("faroImportColumns useMemo missing");
    if (/const FARO_IMPORT_COLUMNS/.test(homeSrc)) f.push("static FARO_IMPORT_COLUMNS still present");
    if (/key: "gross_total_cents"[\s\S]{0,160}fmtCurrency\(Number\(row\.gross_total_cents/.test(homeSrc)) {
      f.push("gross_total_cents still plain fmtCurrency");
    }
    if (!/factoring-faro-import-gross-/.test(homeSrc)) f.push("row gross test id missing");
    if (!/factoring-faro-import-chargeback-/.test(homeSrc)) f.push("row chargeback column/test id missing");
    if (!/factoring-faro-summary-gross/.test(homeSrc)) f.push("summary gross drill missing");
    if (!/factoring-faro-summary-chargeback/.test(homeSrc)) f.push("summary chargeback drill missing");
  }
  return f;
}

function selftest(home, helper) {
  const cases = [
    ["no helper", home, ""],
    ["static columns", home.replace(/buildFaroImportColumns/g, "NOPE").replace(/faroImportColumns/g, "FARO_IMPORT_COLUMNS"), helper],
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
  console.log(`${LABEL}: PASS — Faro import money drills factoring cohorts with ret`);
}
