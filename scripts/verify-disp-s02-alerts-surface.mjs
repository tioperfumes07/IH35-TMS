#!/usr/bin/env node
/** DISP-S02 — /dispatch/alerts page is entity-scoped + honest empty + wired in manifest. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-disp-s02-alerts-surface";
const SELFTEST = process.argv.includes("--selftest");
const PAGE = "apps/frontend/src/pages/dispatch/DispatchAlertsPage.tsx";
const MANIFEST = "apps/frontend/src/routes/manifest.tsx";

function assertLive() {
  const problems = [];
  const page = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  const manifest = fs.readFileSync(path.join(ROOT, MANIFEST), "utf8");
  if (!/path="\/dispatch\/alerts"/.test(manifest) || !/DispatchAlertsPage/.test(manifest)) {
    problems.push("manifest missing /dispatch/alerts → DispatchAlertsPage");
  }
  if (!/useCompanyContext/.test(page) || !/selectedCompanyId/.test(page)) {
    problems.push("page not company-context scoped");
  }
  if (!/enabled:\s*Boolean\(companyId\)/.test(page)) {
    problems.push("queries not gated on companyId");
  }
  if (!/getSafetyAccidents\(companyId\)/.test(page)) problems.push("accidents query missing companyId");
  if (!/listLateArrivalDispatchLoads\(companyId\)/.test(page)) problems.push("late arrivals missing companyId");
  if (!/data-testid="dispatch-alerts-honest-empty"/.test(page)) {
    problems.push("missing honest-empty when all alert counts are 0");
  }
  if (!/ListErrorBanner/.test(page)) problems.push("missing ListErrorBanner on query failure");
  if (!/data-testid="dispatch-alerts-page"/.test(page)) problems.push("missing page testid");
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
  fs.writeFileSync(pagePath, orig.replace(/data-testid="dispatch-alerts-honest-empty"/, 'data-testid="x"'));
  try {
    const planted = assertLive();
    if (!planted.length) {
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
