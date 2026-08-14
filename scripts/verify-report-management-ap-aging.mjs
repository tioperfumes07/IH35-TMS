#!/usr/bin/env node
/** @matrix-built {"modules":["reports"],"cols":["ap_bill","vendor"],"leafRe":"^report\\.management$","task":"ACCT-F5158-REPORT-MANAGEMENT-AP-AGING"} */
/**
 * OWNER-EXECUTION-PLAN §2 money-cells sweep (2026-08-14): report.management's A/P Aging section
 * reuses getApAgingReport (the same canonical backend call APAgingPage.tsx uses) and renders each
 * vendor's aging buckets with a real EntityLink — a genuine vendor-level ap_bill rollup, not the
 * individual-bill drill-through the standalone AP aging page has (that's why this leaf owns only
 * ap_bill + vendor, not reverse_link/connectivity too).
 *
 * Self-test: node scripts/verify-report-management-ap-aging.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/frontend/src/pages/reports/ManagementReportPackagePage.tsx";
const LABEL = "verify-report-management-ap-aging";

export function audit(src) {
  const failures = [];
  if (!/getApAgingReport\(companyId,\s*asOfDate\)/.test(src)) {
    failures.push(`${FILE}: A/P section must call the canonical getApAgingReport (same source as the standalone AP aging report)`);
  }
  if (!/kind="vendor"\s+id=\{row\.vendor_id\}/.test(src)) {
    failures.push(`${FILE}: A/P aging rows must render a real EntityLink kind="vendor"`);
  }
  if (!/bucket_1_30_cents[\s\S]{0,300}bucket_31_60_cents[\s\S]{0,300}bucket_61_90_cents[\s\S]{0,300}bucket_91_plus_cents/.test(src)) {
    failures.push(`${FILE}: A/P aging table must render the full bucket breakdown (current/1-30/31-60/61-90/91+)`);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const good = fs.readFileSync(path.join(ROOT, FILE), "utf8");
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }
  const mutations = [
    ["source-call", /getApAgingReport\(companyId,\s*asOfDate\)/, "getSomeOtherReport(companyId, asOfDate)"],
    ["vendor-link", /kind="vendor"\s+id=\{row\.vendor_id\}/g, 'kind="unit" id={row.vendor_id}'],
    ["bucket-breakdown", /bucket_91_plus_cents/g, "removed_bucket"],
  ];
  for (const [name, pattern, replacement] of mutations) {
    const mutated = good.replace(pattern, replacement);
    if (mutated === good) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}: pattern did not match source, re-anchor`);
      process.exit(1);
    }
    if (audit(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}: mutation escaped`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected`);
  process.exit(0);
}

const failures = audit(fs.readFileSync(path.join(ROOT, FILE), "utf8"));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — management report's A/P aging section is a real vendor-level ap_bill rollup`);
