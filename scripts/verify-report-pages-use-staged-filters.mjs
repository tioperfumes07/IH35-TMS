#!/usr/bin/env node
/**
 * RPT-04 guard: verify every filterable report page uses useStagedListFilters.
 *
 * The staged-filter pattern (ARAgingPage.tsx / APAgingPage.tsx reference) requires:
 *   import { useStagedListFilters } from "../../components/table";
 *
 * Pages excluded (not filterable list tables — hub/nav/banner/modal/subscription/builder):
 *   ReportsHome.tsx, ReportsHub.tsx, ReportsRunner.tsx, ReportsSubNav.tsx,
 *   ScheduleReportModal.tsx, SubscriptionManager.tsx, ReportBlockTPendingBanner.tsx,
 *   ReportBlockVPendingBanner.tsx, ScheduledReportsBackendPendingBanner.tsx,
 *   ScheduledReportsPanel.tsx
 *
 * Pages excluded with documented reasons (no filter state to stage):
 *   CustomReportBuilder.tsx — builder UI, filter state is field selection, not filter controls
 *   PostedWhileTourOpenReportPage.tsx — no filter state at all (static report)
 *   ScheduledReportsPage.tsx — URL-based preset, no local filter state to stage
 *
 * Usage:
 *   node scripts/verify-report-pages-use-staged-filters.mjs --selftest
 *   node scripts/verify-report-pages-use-staged-filters.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-report-pages-use-staged-filters";
const REPORTS_DIR = path.join(ROOT, "apps/frontend/src/pages/reports");

// Files that are NOT filterable list tables — hub/nav/banner/modal/subscription
const STRUCTURAL_EXCLUSIONS = new Set([
  "ReportsHome.tsx",
  "ReportsHub.tsx",
  "ReportsRunner.tsx",
  "ReportsSubNav.tsx",
  "ScheduleReportModal.tsx",
  "SubscriptionManager.tsx",
  "ReportBlockTPendingBanner.tsx",
  "ReportBlockVPendingBanner.tsx",
  "ScheduledReportsBackendPendingBanner.tsx",
  "ScheduledReportsPanel.tsx",
]);

// Files with documented reasons for not having staged filters
const DOCUMENTED_EXCLUSIONS = new Set([
  "CustomReportBuilder.tsx",            // builder UI, filter state is field selection, not filter controls
  "PostedWhileTourOpenReportPage.tsx",  // no filter state at all (static report)
  "ScheduledReportsPage.tsx",           // URL-based preset, no local filter state to stage
]);

export function checkSources({ files }) {
  const problems = [];
  for (const { name, content } of files) {
    if (STRUCTURAL_EXCLUSIONS.has(name)) continue;
    if (DOCUMENTED_EXCLUSIONS.has(name)) continue;
    if (!/useStagedListFilters/.test(content)) {
      problems.push(`${name}: missing useStagedListFilters import — report pages must use staged filters (ARAgingPage.tsx pattern)`);
    }
  }
  return problems;
}

function selftest() {
  const goodContent = `import { useStagedListFilters } from "../../components/table";`;
  const badContent = `import { useState } from "react";`;

  const baseFiles = [
    { name: "BalanceSheetPage.tsx", content: goodContent },
    { name: "ReportsHome.tsx", content: badContent }, // structural exclusion
    { name: "CustomReportBuilder.tsx", content: badContent }, // documented exclusion
  ];

  const cases = [
    { name: "all filterable pages have useStagedListFilters", args: { files: baseFiles }, expectProblems: false },
    { name: "a filterable page missing useStagedListFilters", args: { files: [{ name: "BalanceSheetPage.tsx", content: badContent }] }, expectProblems: true },
    { name: "structural exclusion not flagged", args: { files: [{ name: "ReportsHome.tsx", content: badContent }] }, expectProblems: false },
    { name: "documented exclusion not flagged", args: { files: [{ name: "CustomReportBuilder.tsx", content: badContent }] }, expectProblems: false },
  ];

  let failed = 0;
  for (const c of cases) {
    const problems = checkSources(c.args);
    const ok = (problems.length > 0) === c.expectProblems;
    if (!ok) failed += 1;
    console.log(`${ok ? "OK" : "FAIL"} [${c.name}] problems=${JSON.stringify(problems)}`);
  }

  if (failed > 0) {
    console.error(`${LABEL} --selftest: ${failed}/${cases.length} mutation case(s) failed`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest: ${cases.length}/${cases.length} mutation case(s) PASS`);
}

async function main() {
  if (process.argv.includes("--selftest")) return selftest();

  const allFiles = fs.readdirSync(REPORTS_DIR).filter((f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx"));
  const files = allFiles.map((name) => ({
    name,
    content: fs.readFileSync(path.join(REPORTS_DIR, name), "utf8"),
  }));

  const problems = checkSources({ files });
  if (problems.length) {
    console.error(`${LABEL} FAILED:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL}: OK — all filterable report pages import useStagedListFilters`);
}

main().catch((err) => {
  console.error(`${LABEL}: ERROR`, err);
  process.exit(1);
});
