#!/usr/bin/env node
/**
 * verify-reports-ifta-preparer-no-owner-approval-copy.mjs
 * LV-REPORTS-IFTA-PREPARER-STALE-OWNER-APPROVAL-COPY
 *
 * IFTA Quarterly Preparer PageHeader subtitle must not claim "owner approval"
 * as a wizard step (no-holds / no owner-approval-gate law). Step 4 remains a
 * controlled final review; WF-064 Owner-role confirm stays in Step4FinalReview.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-reports-ifta-preparer-no-owner-approval-copy";
const PAGE = "apps/frontend/src/pages/reports/tax-regulatory/IftaPreparer.tsx";

function read(rel) {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

function analyze(src) {
  const failures = [];
  if (!/PageHeader/.test(src)) {
    failures.push(`${PAGE}: must keep PageHeader`);
  }
  const subMatch = src.match(/subtitle=\{`[^`]*`\}/);
  if (!subMatch) {
    failures.push(`${PAGE}: PageHeader subtitle template missing`);
    return failures;
  }
  const subtitle = subMatch[0];
  if (/owner\s+approval/i.test(subtitle)) {
    failures.push(`${PAGE}: subtitle must not say "owner approval" (use controlled final-review wording)`);
  }
  if (!/4-step wizard/i.test(subtitle)) {
    failures.push(`${PAGE}: subtitle must keep 4-step wizard framing`);
  }
  if (!/mileage/i.test(subtitle) || !/fuel/i.test(subtitle) || !/tax/i.test(subtitle)) {
    failures.push(`${PAGE}: subtitle must still name mileage, fuel, and tax steps`);
  }
  if (!/final review/i.test(subtitle)) {
    failures.push(`${PAGE}: subtitle must name final review as step 4 (not owner-approval gate)`);
  }
  return failures;
}

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

function selftest() {
  const pagePath = path.join(process.cwd(), PAGE);
  const original = fs.readFileSync(pagePath, "utf8");
  try {
    const planted = original.replace(
      /subtitle=\{`[^`]*`\}/,
      "subtitle={`${quarter} · 4-step wizard (mileage, fuel, tax, owner approval)`}",
    );
    fs.writeFileSync(pagePath, planted);
    const bad = analyze(planted);
    if (!bad.some((m) => /must not say "owner approval"/.test(m))) {
      fail("selftest expected owner-approval subtitle reintroduction to fail");
    }
  } finally {
    fs.writeFileSync(pagePath, original);
  }
  const good = analyze(original);
  if (good.length) fail(`selftest expected GOOD after restore: ${good.join("; ")}`);
  console.log(`${LABEL} selftest PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const failures = analyze(read(PAGE));
  if (failures.length) {
    for (const f of failures) console.error(`${LABEL} FAIL: ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS — IFTA preparer subtitle uses final review (no owner-approval gate copy)`);
}

main();
