#!/usr/bin/env node
/**
 * FORM425C-HISTORY-HIDES-DRAFTS — History must list the same reports GET returns,
 * including status=draft. Filtering History to filed-only makes Create/Load Draft
 * look like a silent no-op on the History tab (Live: TEST-425C-CURSOR-20260823
 * 201 draft, History "0 rows / No reports found").
 *
 * Self-test: node scripts/verify-form425c-history-includes-drafts.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-form425c-history-includes-drafts";
const HOME = "apps/frontend/src/pages/form425c/Form425CHome.tsx";
const TAB = "apps/frontend/src/pages/form425c/tabs/HistoryTab.tsx";

export function collectProblems(homeSrc, tabSrc) {
  const problems = [];
  if (!/historyReports = \(reportsQuery\.data\?\.reports \?\? \[\]\) as HistoryReportRow\[\]/.test(homeSrc)) {
    problems.push(`${HOME}: historyReports must bind the full reportsQuery list`);
  }
  if (/\.filter\(\(r\) => r\.status === ["']filed["']\)/.test(homeSrc)) {
    problems.push(`${HOME}: History must not silently drop non-filed reports`);
  }
  if (!tabSrc.includes('emptyText="No reports found."')) {
    problems.push(`${TAB}: missing History empty copy (guard fixture)`);
  }
  if (!tabSrc.includes('"draft"')) {
    problems.push(`${TAB}: status filter must include draft`);
  }
  return problems;
}

function readRel(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

if (process.argv.includes("--selftest")) {
  const goodHome =
    'const historyReports = (reportsQuery.data?.reports ?? []) as HistoryReportRow[];\n';
  const badHome =
    'const historyReports = ((reportsQuery.data?.reports ?? []) as HistoryReportRow[]).filter((r) => r.status === "filed");\n';
  const tab = 'emptyText="No reports found."\nSTATUS_OPTIONS = ["", "draft", "ready_to_file", "filed"]\n';
  const good = collectProblems(goodHome, tab);
  const bad = collectProblems(badHome, tab);
  if (good.length) {
    console.error(`${LABEL} --selftest FAIL: good fixture: ${good.join("; ")}`);
    process.exit(1);
  }
  if (!bad.some((p) => p.includes("silently drop"))) {
    console.error(`${LABEL} --selftest FAIL: filed-only filter must fail`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

const problems = collectProblems(readRel(HOME), readRel(TAB));
if (problems.length) {
  console.error(`${LABEL}: FAIL\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — History binds full reports list (drafts included)`);
process.exit(0);
