#!/usr/bin/env node
/**
 * verify-cash-flow-avp-accuracy-kpi-drills — ROUND 8.20 board6.
 * Income/Expense accuracy KPIs must drill Banking range Money In/Out with ret
 * (not inert #cash-flow-avp-table anchors).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-cash-flow-avp-accuracy-kpi-drills";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/frontend/src/pages/cash-flow/tabs/ActualVsProjectedTab.tsx";

export function check(src) {
  const f = [];
  if (!src) {
    f.push("ActualVsProjectedTab.tsx missing");
    return f;
  }
  if (!/export function buildAvpAccuracyKpiDrillHref/.test(src)) {
    f.push("buildAvpAccuracyKpiDrillHref missing");
  }
  if (!/types=\$\{types\}/.test(src) && !/types=\$\{opts\.category/.test(src)) {
    // builder uses types=money_in|money_out
    if (!/types=\$\{types\}/.test(src)) {
      f.push("accuracy KPI drill must set Banking types=");
    }
  }
  if (!/review=all/.test(src)) {
    f.push("accuracy KPI drill must use review=all");
  }
  // Income KPI must call the builder (not #cash-flow-avp-table).
  if (/testId="cash-flow-avp-v3-kpi-income"[\s\S]{0,200}href=\{`#cash-flow-avp-table`\}/.test(src)) {
    f.push("income accuracy KPI still uses #cash-flow-avp-table anchor");
  }
  if (!/buildAvpAccuracyKpiDrillHref\(\s*\{\s*category:\s*"income"/.test(src)) {
    f.push("income accuracy KPI does not call buildAvpAccuracyKpiDrillHref");
  }
  if (!/buildAvpAccuracyKpiDrillHref\(\s*\{\s*category:\s*"expenses"/.test(src)) {
    f.push("expense accuracy KPI does not call buildAvpAccuracyKpiDrillHref");
  }
  if (!/withReturnContext\(target, originHref\)/.test(src)) {
    f.push("accuracy KPI drill must carry ret via withReturnContext");
  }
  return f;
}

function selftest(live) {
  const cases = [
    [
      "no builder",
      live.replace(/export function buildAvpAccuracyKpiDrillHref[\s\S]*?\n\}/, ""),
    ],
    [
      "income anchor",
      live.replace(
        /buildAvpAccuracyKpiDrillHref\(\s*\{\s*category:\s*"income"[\s\S]*?originHref,\s*\)/,
        '`#cash-flow-avp-table`',
      ),
    ],
    ["file deleted", ""],
  ];
  let pass = check(live).length === 0 ? 1 : 0;
  if (!pass) console.error(`${LABEL} --selftest: live tree fails`, check(live));
  for (const [name, src] of cases) {
    if (check(src).length > 0) pass += 1;
    else console.error(`${LABEL} --selftest: did not catch "${name}"`);
  }
  const total = cases.length + 1;
  if (pass !== total) {
    console.error(`${LABEL} --selftest FAIL ${pass}/${total}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS ${pass}/${total}`);
}

const src = fs.existsSync(path.join(ROOT, FILE)) ? fs.readFileSync(path.join(ROOT, FILE), "utf8") : "";
if (process.argv.includes("--selftest")) selftest(src);
else {
  const f = check(src);
  if (f.length) {
    for (const x of f) console.error(`${LABEL}: FAIL — ${x}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — AVP accuracy KPIs drill Banking range with ret`);
}
