#!/usr/bin/env node
/** DISP-S23 — /dispatch/map entity-scoped + honest empty. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-disp-s23-map-surface";
const SELFTEST = process.argv.includes("--selftest");
const PAGE = "apps/frontend/src/pages/dispatch/MapView.tsx";
const MANIFEST = "apps/frontend/src/routes/manifest.tsx";

function assertLive() {
  const problems = [];
  const page = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  const manifest = fs.readFileSync(path.join(ROOT, MANIFEST), "utf8");
  if (!/path="\/dispatch\/map"/.test(manifest) || !/MapView/.test(manifest)) {
    problems.push("manifest missing /dispatch/map");
  }
  if (!/useCompanyContext/.test(page) || !/enabled:\s*Boolean\(companyId\)/.test(page)) {
    problems.push("positions query not company-gated");
  }
  if (!/operating_company_id=\$\{companyId\}/.test(page) && !/operating_company_id=\$\{/.test(page)) {
    problems.push("fetch missing operating_company_id");
  }
  if (!/data-testid="dispatch-map-need-company"/.test(page)) problems.push("missing need-company");
  if (!/data-testid="dispatch-map-positions-honest-empty"/.test(page)) {
    problems.push("missing positions honest empty");
  }
  if (!/ListErrorBanner/.test(page)) problems.push("missing ListErrorBanner");
  if (!/data-dispatch-map-honest-empty="true"/.test(page)) {
    problems.push("missing map-not-configured honest empty");
  }
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
  fs.writeFileSync(pagePath, orig.replace(/data-testid="dispatch-map-positions-honest-empty"/, 'data-testid="x"'));
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
