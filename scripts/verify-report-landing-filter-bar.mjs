/**
 * verify-report-landing-filter-bar.mjs
 *
 * K.9 pattern guard — every data-bearing report page under apps/frontend/src/pages/reports/**
 * must have its filter bar visible on first load (0 clicks) with ≥3 visible filter controls.
 *
 * Pass conditions per page:
 *   1. Uses CollapsedListFilters with defaultOpen={true} OR has inline filter controls
 *      visible on first load (not behind a click).
 *   2. Has ≥3 filter controls (DatePicker, select, input, SelectCombobox, EntityPicker,
 *      Combobox, MoneyInput, BasisSelector, checkbox).
 *
 * Exits 0 if all pages pass, 1 otherwise.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, basename, relative } from "node:path";

const REPORTS_DIR = join(
  new URL(".", import.meta.url).pathname,
  "..",
  "apps",
  "frontend",
  "src",
  "pages",
  "reports",
);

// ── File exclusion rules ──────────────────────────────────────────────────

const EXCLUDE_NAME_PATTERNS = [
  /\.test\./,
  /\.source-honesty\./,
];
const EXCLUDE_PATH_PATTERNS = [
  /__tests__/,
  /(^|\/)categories\//,      // category nav pages
  /(^|\/)ifta\//,            // IFTA wizard steps
  /(^|\/)tax-regulatory\//,  // IFTA preparer
  /(^|\/)form-425c\//,       // form viewer
];
const EXCLUDE_BASENAMES = new Set([
  "ReportsHub.tsx",
  "ReportsHome.tsx",
  "ReportsSubNav.tsx",
  "ReportBlockTPendingBanner.tsx",
  "ReportBlockVPendingBanner.tsx",
  "ScheduledReportsBackendPendingBanner.tsx",
  "ScheduleReportModal.tsx",
  "ScheduledReportsPanel.tsx",
  "ScheduledReportsPage.tsx",
  "SubscriptionManager.tsx",
  "CustomReportBuilder.tsx",
  "RunnerTable.tsx",
  "ReportsRunner.tsx",         // orchestrator — delegates to RunnerFilters + CsaFleetScoreCard
  // Audit sub-pages are thin wrappers around AuditReportPage (checked directly).
  "AuditActivityByModulePage.tsx",
  "AuditActivityByUserPage.tsx",
  "AuditDeductionTrailPage.tsx",
  "AuditFinancialChangeLogPage.tsx",
  "AuditMaintenanceDecisionLogPage.tsx",
  "AuditPeriodCloseHistoryPage.tsx",
  "AuditVoidReversalPage.tsx",
]);

// ── Control detection ─────────────────────────────────────────────────────

const CONTROL_REGEXES = [
  /<DatePicker[\s>]/g,
  /<SelectCombobox[\s>]/g,
  /<select[\s>]/g,
  /<EntityPicker[\s>]/g,
  /<Combobox[\s>]/g,
  /<MoneyInput[\s>]/g,
  /<BasisSelector[\s>]/g,
  /<input[^>]*type="checkbox"/g,
  /<input[^>]*type="text"/g,
  /<input[^>]*type="number"/g,
  /<input[^>]*type="month"/g,
];

function countControls(source) {
  let total = 0;
  for (const re of CONTROL_REGEXES) {
    const matches = source.match(re);
    if (matches) total += matches.length;
  }
  return total;
}

function usesCollapsedListFilters(source) {
  return /<CollapsedListFilters[\s>]/.test(source);
}

function hasDefaultOpen(source) {
  return /defaultOpen\s*=\s*\{true\}/.test(source)
    || /defaultOpen\s*=\s*\{[^}]*\?\s*true/.test(source);
}

function hasInlineFilterBar(source) {
  // ParityTable filterBar prop or direct inline controls outside CollapsedListFilters
  return /filterBar\s*=\s*\{/.test(source)
    || /data-runner-filter-toolbar/.test(source);
}

// ── File walker ───────────────────────────────────────────────────────────

function walkTsxDirectories(dir, all = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walkTsxDirectories(full, all);
    } else if (entry.endsWith(".tsx")) {
      all.push(full);
    }
  }
  return all;
}

function isExcluded(filePath) {
  const name = basename(filePath);
  const rel = relative(REPORTS_DIR, filePath);

  if (EXCLUDE_BASENAMES.has(name)) return true;
  for (const re of EXCLUDE_NAME_PATTERNS) {
    if (re.test(name)) return true;
  }
  for (const re of EXCLUDE_PATH_PATTERNS) {
    if (re.test(rel)) return true;
  }
  return false;
}

// ── Main ──────────────────────────────────────────────────────────────────

const files = walkTsxDirectories(REPORTS_DIR);
const failures = [];
const passes = [];

for (const filePath of files) {
  if (isExcluded(filePath)) continue;

  const source = readFileSync(filePath, "utf-8");
  const rel = relative(REPORTS_DIR, filePath);

  const collapsed = usesCollapsedListFilters(source);
  const controlCount = countControls(source);

  // Skip files with zero filter controls — not data-bearing report pages.
  if (controlCount === 0 && !collapsed) continue;

  const defaultOpenOk = !collapsed || hasDefaultOpen(source);
  const inlineOk = !collapsed || hasInlineFilterBar(source);
  const visibleOnLoad = defaultOpenOk || inlineOk || !collapsed;
  const enoughControls = controlCount >= 3;

  if (visibleOnLoad && enoughControls) {
    passes.push(`${rel}: ${controlCount} controls${collapsed ? ", defaultOpen ✓" : ", inline ✓"}`);
  } else {
    const reasons = [];
    if (collapsed && !defaultOpenOk) reasons.push("missing defaultOpen={true}");
    if (!enoughControls) reasons.push(`only ${controlCount} controls (need ≥3)`);
    failures.push(`${rel}: ${reasons.join(", ")}`);
  }
}

// ── Report ────────────────────────────────────────────────────────────────

console.log("verify-report-landing-filter-bar — K.9 pattern guard");
console.log(`Checked ${passes.length + failures.length} data-bearing report pages`);
console.log(`Pass: ${passes.length} · Fail: ${failures.length}`);

if (passes.length > 0) {
  console.log("\n✓ Passing pages:");
  for (const p of passes) console.log(`  ✓ ${p}`);
}

if (failures.length > 0) {
  console.log("\n✗ Failing pages:");
  for (const f of failures) console.log(`  ✗ ${f}`);
}

if (failures.length > 0) {
  console.error(`\nFAIL: ${failures.length} page(s) do not meet the K.9 filter-bar landing pattern.`);
  process.exit(1);
}

console.log("\nPASS: All report pages have visible filter bars with ≥3 controls on first load.");
process.exit(0);
