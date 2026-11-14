#!/usr/bin/env node
/**
 * verify-fuel-fraud-kpi-ret — ROUND 8.20 board19.
 * Fuel fraud-alerts KPI must wrap /fuel/fraud-alerts with withReturnContext.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-fuel-fraud-kpi-ret";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/fuel/FuelHome.tsx";

export function check(src) {
  const f = [];
  if (!src) return ["FuelHome.tsx missing"];
  if (!/testId="fuel-fraud-alerts-kpi"[\s\S]{0,200}withReturnContext\("\/fuel\/fraud-alerts"/.test(src)) {
    f.push("fraud KPI must href withReturnContext(/fuel/fraud-alerts)");
  }
  if (/testId="fuel-fraud-alerts-kpi"[\s\S]{0,120}href="\/fuel\/fraud-alerts"/.test(src)) {
    f.push("fraud KPI still bare /fuel/fraud-alerts");
  }
  return f;
}

function selftest(src) {
  const cases = [
    ["bare href", src.replace(/href=\{withReturnContext\("\/fuel\/fraud-alerts", originHref\)\}/, 'href="/fuel/fraud-alerts"')],
    ["no ret", src.replace(/withReturnContext\("\/fuel\/fraud-alerts", originHref\)/g, '"/fuel/fraud-alerts"')],
    ["missing", ""],
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

const src = fs.existsSync(path.join(ROOT, PAGE)) ? fs.readFileSync(path.join(ROOT, PAGE), "utf8") : "";
if (process.argv.includes("--selftest")) selftest(src);
else {
  const f = check(src);
  if (f.length) {
    for (const x of f) console.error(`${LABEL}: FAIL — ${x}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — Fuel fraud KPI carries ret`);
}
