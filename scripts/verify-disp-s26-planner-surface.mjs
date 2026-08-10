#!/usr/bin/env node
/** DISP-S26 — /dispatch/planner entity-scoped + honest empty. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-disp-s26-planner-surface";
const SELFTEST = process.argv.includes("--selftest");
const PAGE = "apps/frontend/src/pages/dispatch/PlannerCalendarPage.tsx";
const MANIFEST = "apps/frontend/src/routes/manifest.tsx";
const API = "apps/frontend/src/api/dispatch.ts";

function assertLive() {
  const problems = [];
  const page = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  const manifest = fs.readFileSync(path.join(ROOT, MANIFEST), "utf8");
  const api = fs.readFileSync(path.join(ROOT, API), "utf8");
  if (!/path="\/dispatch\/planner"/.test(manifest) || !/PlannerCalendarPage/.test(manifest)) {
    problems.push("manifest missing /dispatch/planner → PlannerCalendarPage");
  }
  if (!/useCompanyContext/.test(page) || !/enabled:\s*Boolean\(companyId\)/.test(page)) {
    problems.push("planner week query not company-gated");
  }
  if (!/getDispatchPlannerWeek\(companyId/.test(page)) {
    problems.push("page does not call getDispatchPlannerWeek with companyId");
  }
  if (!/URLSearchParams\(\{\s*operating_company_id:\s*operatingCompanyId/.test(api)) {
    problems.push("getDispatchPlannerWeek missing operating_company_id query param");
  }
  if (!/data-testid="dispatch-planner-need-company"/.test(page)) problems.push("missing need-company");
  if (!/data-testid="dispatch-planner-honest-empty"/.test(page)) problems.push("missing honest empty");
  if (!/ListErrorBanner/.test(page)) problems.push("missing ListErrorBanner");
  return problems;
}

if (SELFTEST) {
  const live = assertLive();
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${live.join(" | ")}`);
    process.exit(1);
  }
  const pagePath = path.join(ROOT, PAGE);
  const orig = fs.readFileSync(pagePath, "utf8");
  fs.writeFileSync(pagePath, orig.replace(/data-testid="dispatch-planner-honest-empty"/, 'data-testid="x"'));
  try {
    if (!assertLive().length) {
      console.error(`${LABEL} SELFTEST FAILED: planted defect not caught`);
      process.exit(1);
    }
  } finally {
    fs.writeFileSync(pagePath, orig);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assertLive();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
