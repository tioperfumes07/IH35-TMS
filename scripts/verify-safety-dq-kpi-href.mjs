#!/usr/bin/env node
/**
 * verify-safety-dq-kpi-href — ROUND 8.20 board24.
 * Driver Qualification matrix KPIs must use shareable href (cohort/summary URL), not onClick-only.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-safety-dq-kpi-href";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/safety/components/DriverQualificationMatrix.tsx";

export function check(src) {
  const f = [];
  if (!src) return ["DriverQualificationMatrix.tsx missing"];
  if (!/cohortHref/.test(src)) f.push("cohortHref helper missing");
  if (!/summaryHref/.test(src)) f.push("summaryHref helper missing");
  if (!/href=\{cohortHref\("medical"\)\}/.test(src)) f.push("medical KPI href missing");
  if (!/href=\{cohortHref\("cdl"\)\}/.test(src)) f.push("cdl KPI href missing");
  if (!/href=\{summaryHref\("fines"\)\}/.test(src)) f.push("fines KPI href missing");
  if (!/href=\{summaryHref\("alerts"\)\}/.test(src)) f.push("alerts KPI href missing");
  if (!/testId="dq-kpi-cdl"/.test(src)) f.push("dq-kpi-cdl test id missing");
  if (/onClick=\{\(\) => setCohort\("medical"\)\}/.test(src)) f.push("medical KPI still onClick-only");
  if (/onClick=\{\(\) => setSummarySource\("fines"\)\}/.test(src)) f.push("fines KPI still onClick-only");
  return f;
}

function selftest(src) {
  const cases = [
    ["no cohortHref", src.replace(/cohortHref/g, "noop")],
    ["onClick medical", src.replace(/href=\{cohortHref\("medical"\)\}/, 'onClick={() => setCohort("medical")}')],
    ["no fines href", src.replace(/href=\{summaryHref\("fines"\)\}/, 'onClick={() => setSummarySource("fines")}')],
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
  console.log(`${LABEL}: PASS — Safety DQ KPIs use shareable cohort/summary href`);
}
