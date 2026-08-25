#!/usr/bin/env node
/**
 * UI-BACK-BUTTON-MISSING-ENTIRELY / UI-BACK-BUTTON-IGNORES-REAL-NAVIGATION-HISTORY — audit wave 4.
 * Owner report (2026-08-25): "many leafs or tabs are missing the back arrow return button... make
 * sure that those that have it take you back to the correct module."
 *
 * Continuing the systemwide route-manifest audit: 10 Safety alias-tab leaves, 1 Dispatch leaf
 * (MapView), 4 Finance leaves, and 9 other standalone leaves (3 of which share ProgramModuleNav,
 * fixed once there) had no back control at all; 3 more (DefectDetailPage in wave 3, IdvrDetailPage
 * and NotificationPreferencesPage here) had a REAL but hardcoded back link -- the wrong-destination
 * defect class, not missing. This guard mutation-proves a representative sample across every
 * sub-class fixed in this wave: a plain PageHeader-backed leaf, the shared ProgramModuleNav fix,
 * and a smart-back-upgraded hardcoded link.
 */
import fs from "node:fs";

const PAGE_HEADER_FILES = [
  "apps/frontend/src/pages/safety/TrainingProgramsPage.tsx",
  "apps/frontend/src/pages/safety/TrainingRecordsPage.tsx",
  "apps/frontend/src/pages/safety/hos/HosExceptionsPage.tsx",
  "apps/frontend/src/pages/safety/expiry-tracking/ExpiryDashboard.tsx",
  "apps/frontend/src/pages/safety/CSAMitigationQueue.tsx",
  "apps/frontend/src/pages/safety/CSAScore.tsx",
  "apps/frontend/src/pages/safety/anomaly/AnomalyAlertsPage.tsx",
  "apps/frontend/src/pages/safety/audit-425c/Audit425cPage.tsx",
  "apps/frontend/src/pages/safety/reports/SafetyReportsPage.tsx",
  "apps/frontend/src/pages/dispatch/MapView.tsx",
  "apps/frontend/src/pages/settings/UserProfileSettingsPage.tsx",
  "apps/frontend/src/pages/reports/form-425c/ExhibitsViewer.tsx",
  "apps/frontend/src/pages/admin/USMCAActivationPanel.tsx",
  "apps/frontend/src/pages/alerts/DocumentAlertsPage.tsx",
  "apps/frontend/src/pages/fleet/FleetHomePage.tsx",
];

// Finance pages use components/layout/PageHeader (a different variant from the forms/shared one
// above) with backHref="/finance/overview" -- matched to the pre-existing convention already used
// by 6 of the 10 Finance pages, not invented here.
const FINANCE_PAGE_HEADER_FILES = [
  "apps/frontend/src/pages/finance/LoanWizardPage.tsx",
  "apps/frontend/src/pages/finance/CalculatorPage.tsx",
  "apps/frontend/src/pages/finance/AmortizationPage.tsx",
  "apps/frontend/src/pages/finance/FinancialStatementsPage.tsx",
];

const PROGRAM_MODULE_NAV_FILE = "apps/frontend/src/pages/program/ProgramModuleNav.tsx";

// Files where a hardcoded back <Link>/<button> was upgraded to the smart-back pattern (idvr detail
// had TWO instances; notification preferences also had two).
const SMART_BACK_UPGRADE_FILES = [
  "apps/frontend/src/pages/safety/IdvrDetailPage.tsx",
  "apps/frontend/src/pages/settings/NotificationPreferencesPage.tsx",
];

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
}

function auditPageHeaderFile(file, source) {
  const failures = [];
  const stripped = stripComments(source);
  if (!/<PageHeader\b/.test(stripped)) {
    failures.push(`${file}: must render <PageHeader ...> -- it had no back control at all`);
  }
  return failures;
}

function auditProgramModuleNav(source) {
  const failures = [];
  const stripped = stripComments(source);
  if (!/import\s*\{\s*hasInAppHistory\s*\}\s*from\s*["'][./]*lib\/smart-back["']/.test(stripped)) {
    failures.push(`${PROGRAM_MODULE_NAV_FILE}: must import hasInAppHistory from the shared smart-back helper`);
  }
  if (!/aria-label=["']Back["']/.test(stripped)) {
    failures.push(`${PROGRAM_MODULE_NAV_FILE}: must render a back control (aria-label="Back")`);
  }
  return failures;
}

function auditSmartBackUpgrade(file, source) {
  const failures = [];
  const stripped = stripComments(source);
  if (!/import\s*\{\s*hasInAppHistory\s*\}\s*from\s*["'][./]*lib\/smart-back["']/.test(stripped)) {
    failures.push(`${file}: must import hasInAppHistory from the shared smart-back helper`);
  }
  if (!/hasInAppHistory\(window\.history\.state\)/.test(stripped)) {
    failures.push(`${file}: back-button handler must call hasInAppHistory(window.history.state)`);
  }
  return failures;
}

const pageHeaderSources = PAGE_HEADER_FILES.map((f) => fs.readFileSync(f, "utf8"));
const financeSources = FINANCE_PAGE_HEADER_FILES.map((f) => fs.readFileSync(f, "utf8"));
const programNavSource = fs.readFileSync(PROGRAM_MODULE_NAV_FILE, "utf8");
const smartBackSources = SMART_BACK_UPGRADE_FILES.map((f) => fs.readFileSync(f, "utf8"));

let failures = [];
pageHeaderSources.forEach((src, i) => (failures = failures.concat(auditPageHeaderFile(PAGE_HEADER_FILES[i], src))));
financeSources.forEach((src, i) => (failures = failures.concat(auditPageHeaderFile(FINANCE_PAGE_HEADER_FILES[i], src))));
failures = failures.concat(auditProgramModuleNav(programNavSource));
smartBackSources.forEach((src, i) => (failures = failures.concat(auditSmartBackUpgrade(SMART_BACK_UPGRADE_FILES[i], src))));

if (failures.length) {
  console.error(`verify-safety-dispatch-finance-other-back-buttons-wired FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  let caught = 0;
  let total = 0;

  // One representative PageHeader-removal mutation per (forms/shared) file.
  for (let i = 0; i < PAGE_HEADER_FILES.length; i++) {
    total += 1;
    const mutated = pageHeaderSources[i].replace(/<PageHeader\b[\s\S]*?\/>/, "<div />");
    if (mutated === pageHeaderSources[i]) throw new Error(`mutation for ${PAGE_HEADER_FILES[i]} did not change source -- inert`);
    const mutSources = [...pageHeaderSources];
    mutSources[i] = mutated;
    const mutFailures = mutSources.flatMap((src, j) => auditPageHeaderFile(PAGE_HEADER_FILES[j], src));
    if (mutFailures.length === 0) throw new Error(`mutation escaped for ${PAGE_HEADER_FILES[i]}`);
    caught += 1;
  }

  // Same for the finance (layout/PageHeader) files.
  for (let i = 0; i < FINANCE_PAGE_HEADER_FILES.length; i++) {
    total += 1;
    const mutated = financeSources[i].replace(/<PageHeader\b[\s\S]*?\/>;/, "null;");
    if (mutated === financeSources[i]) throw new Error(`mutation for ${FINANCE_PAGE_HEADER_FILES[i]} did not change source -- inert`);
    const mutSources = [...financeSources];
    mutSources[i] = mutated;
    const mutFailures = mutSources.flatMap((src, j) => auditPageHeaderFile(FINANCE_PAGE_HEADER_FILES[j], src));
    if (mutFailures.length === 0) throw new Error(`mutation escaped for ${FINANCE_PAGE_HEADER_FILES[i]}`);
    caught += 1;
  }

  // ProgramModuleNav: remove the back button entirely.
  total += 1;
  const mutatedNav = programNavSource.replace(
    /<button\s+type="button"\s+aria-label="Back"[\s\S]*?<\/button>/,
    ""
  );
  if (mutatedNav === programNavSource) throw new Error("mutation for ProgramModuleNav.tsx did not change source -- inert");
  if (auditProgramModuleNav(mutatedNav).length === 0) throw new Error("mutation escaped for ProgramModuleNav.tsx");
  caught += 1;

  // Smart-back-upgrade files: remove the hasInAppHistory import.
  for (let i = 0; i < SMART_BACK_UPGRADE_FILES.length; i++) {
    total += 1;
    const mutated = smartBackSources[i].replace(/import\s*\{\s*hasInAppHistory\s*\}[^\n]*\n/, "");
    if (mutated === smartBackSources[i]) throw new Error(`mutation for ${SMART_BACK_UPGRADE_FILES[i]} did not change source -- inert`);
    if (auditSmartBackUpgrade(SMART_BACK_UPGRADE_FILES[i], mutated).length === 0) {
      throw new Error(`mutation escaped for ${SMART_BACK_UPGRADE_FILES[i]}`);
    }
    caught += 1;
  }

  console.log(`verify-safety-dispatch-finance-other-back-buttons-wired SELFTEST PASS — ${caught}/${total} mutations detected`);
}

console.log(
  `verify-safety-dispatch-finance-other-back-buttons-wired PASS — ${PAGE_HEADER_FILES.length + FINANCE_PAGE_HEADER_FILES.length} leaf pages have a back control, ProgramModuleNav fixes 3 more, ${SMART_BACK_UPGRADE_FILES.length} hardcoded back links upgraded to smart-back`
);
