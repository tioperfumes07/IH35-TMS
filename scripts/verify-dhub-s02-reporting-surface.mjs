#!/usr/bin/env node
/** DHUB-S02 — /driver-hub/reporting need-company + ListErrorBanner + EntityLink. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-dhub-s02-reporting-surface";
const SELFTEST = process.argv.includes("--selftest");
const PAGE = "apps/frontend/src/pages/home/DriverHubReportingPage.tsx";
const MANIFEST = "apps/frontend/src/routes/manifest.tsx";

function read(rel, over = {}) {
  return over[rel] ?? fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertLive(over = {}) {
  const problems = [];
  const src = read(PAGE, over);
  const manifest = read(MANIFEST, over);
  if (!/path="\/driver-hub\/reporting"/.test(manifest)) problems.push("route missing");
  if (!src.includes('data-testid="driver-hub-reporting-need-company"')) problems.push("need-company");
  if (!src.includes('data-testid="driver-hub-reporting-honest-empty"')) problems.push("honest empty");
  if (!src.includes("ListErrorBanner")) problems.push("ListErrorBanner");
  if (!src.includes("EntityLink")) problems.push("EntityLink");
  if (!src.includes("enabled: Boolean(companyId)")) problems.push("not company-gated");
  if (!src.includes("getInboxReporting")) problems.push("getInboxReporting");
  return problems;
}

if (SELFTEST) {
  const live = assertLive();
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${live.join(" | ")}`);
    process.exit(1);
  }
  const orig = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  const plantedPage = orig.replace(/data-testid="driver-hub-reporting-need-company"/, 'data-testid="x"');
  {
    if (!assertLive({ [PAGE]: plantedPage }).length) {
      console.error(`${LABEL} SELFTEST FAILED: planted defect not caught`);
      process.exit(1);
    }
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
