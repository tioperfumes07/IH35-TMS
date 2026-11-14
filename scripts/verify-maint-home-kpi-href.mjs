#!/usr/bin/env node
/**
 * verify-maint-home-kpi-href — ROUND 8.20 board22.
 * Maintenance Home KPIs must use shareable href+ret (not onClick navigate-only).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-maint-home-kpi-href";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/maintenance/MaintenanceHome.tsx";

export function check(src) {
  const f = [];
  if (!src) return ["MaintenanceHome.tsx missing"];
  if (!/href=\{withReturnContext\("\/maintenance\/pm-schedule", originHref\)\}/.test(src)) {
    f.push("PM due KPI must href pm-schedule with ret");
  }
  if (!/href=\{withReturnContext\("\/maintenance\/road-service", originHref\)\}/.test(src)) {
    f.push("Road service KPI must href road-service with ret");
  }
  if (!/href=\{withReturnContext\("\/maintenance\/parts-inventory", originHref\)\}/.test(src)) {
    f.push("Parts KPI must href parts-inventory with ret");
  }
  if (!/href=\{withReturnContext\("\/maintenance\/work-orders", originHref\)\}/.test(src)) {
    f.push("MTD cost KPI must href work-orders with ret");
  }
  if (!/testId="maintenance-kpi-pm-due"/.test(src)) f.push("maintenance-kpi-pm-due test id missing");
  if (/onClick=\{\(\) => navigate\(withReturnContext\("\/maintenance\/pm-schedule"/.test(src)) {
    f.push("PM due KPI still onClick navigate-only");
  }
  return f;
}

function selftest(src) {
  const cases = [
    ["no pm href", src.replace(/href=\{withReturnContext\("\/maintenance\/pm-schedule", originHref\)\}/, "onClick={() => {}}")],
    ["onClick pm", src.replace(/href=\{withReturnContext\("\/maintenance\/pm-schedule", originHref\)\}/, 'onClick={() => navigate(withReturnContext("/maintenance/pm-schedule", originHref))}')],
    ["no mtd", src.replace(/href=\{withReturnContext\("\/maintenance\/work-orders", originHref\)\}/, "")],
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
  console.log(`${LABEL}: PASS — Maintenance Home KPIs use href+ret`);
}
