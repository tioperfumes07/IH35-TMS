#!/usr/bin/env node
/**
 * ROUND 367.9 SUPERSEDES UI-BACK-BUTTON-MISSING-ENTIRELY /
 * UI-BACK-BUTTON-IGNORES-REAL-NAVIGATION-HISTORY for these leaves.
 *
 * Owner 2026-10-03: Up is structural (Module › List › Record), never browser history.
 * PageHeader-backed leaves keep a back control; ProgramModuleNav + IdvrDetail +
 * NotificationPreferences navigate to a structural parent — never hasInAppHistory / navigate(-1).
 *
 * Filename kept (CLAIMED step continuity). Contract body updated to the structural law.
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

// Files where a hardcoded / smart-back link was upgraded to structural Up (ROUND 367.9).
const STRUCTURAL_UP_FILES = [
  {
    file: "apps/frontend/src/pages/safety/IdvrDetailPage.tsx",
    parentHref: "/safety/idvr",
  },
  {
    file: "apps/frontend/src/pages/settings/NotificationPreferencesPage.tsx",
    parentHref: "/settings",
  },
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
  if (!/structuralParentHref/.test(stripped)) {
    failures.push(`${PROGRAM_MODULE_NAV_FILE}: must use structuralParentHref for Up (ROUND 367.9)`);
  }
  if (!/navigate\(\s*structuralParentHref\(pathname\)\s*\)/.test(stripped)) {
    failures.push(`${PROGRAM_MODULE_NAV_FILE}: back handler must navigate(structuralParentHref(pathname))`);
  }
  if (!/aria-label=["']Back["']/.test(stripped)) {
    failures.push(`${PROGRAM_MODULE_NAV_FILE}: must render a back control (aria-label="Back")`);
  }
  if (/hasInAppHistory/.test(stripped) || /navigate\(\s*-1\s*\)/.test(stripped)) {
    failures.push(
      `${PROGRAM_MODULE_NAV_FILE}: must not use hasInAppHistory or navigate(-1) — Up is structural (ROUND 367.9)`,
    );
  }
  return failures;
}

function auditStructuralUp(file, parentHref, source) {
  const failures = [];
  const stripped = stripComments(source);
  const escaped = parentHref.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!new RegExp(`navigate\\(\\s*["']${escaped}["']\\s*\\)`).test(stripped)) {
    failures.push(`${file}: Up must navigate("${parentHref}") — structural parent (ROUND 367.9)`);
  }
  if (/hasInAppHistory/.test(stripped) || /navigate\(\s*-1\s*\)/.test(stripped)) {
    failures.push(
      `${file}: must not use hasInAppHistory or navigate(-1) — Up is structural (ROUND 367.9)`,
    );
  }
  return failures;
}

const pageHeaderSources = PAGE_HEADER_FILES.map((f) => fs.readFileSync(f, "utf8"));
const financeSources = FINANCE_PAGE_HEADER_FILES.map((f) => fs.readFileSync(f, "utf8"));
const programNavSource = fs.readFileSync(PROGRAM_MODULE_NAV_FILE, "utf8");
const structuralSources = STRUCTURAL_UP_FILES.map(({ file }) => fs.readFileSync(file, "utf8"));

let failures = [];
pageHeaderSources.forEach((src, i) => (failures = failures.concat(auditPageHeaderFile(PAGE_HEADER_FILES[i], src))));
financeSources.forEach((src, i) => (failures = failures.concat(auditPageHeaderFile(FINANCE_PAGE_HEADER_FILES[i], src))));
failures = failures.concat(auditProgramModuleNav(programNavSource));
structuralSources.forEach((src, i) => {
  failures = failures.concat(
    auditStructuralUp(STRUCTURAL_UP_FILES[i].file, STRUCTURAL_UP_FILES[i].parentHref, src),
  );
});

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

  // ProgramModuleNav: remove structuralParentHref usage.
  total += 1;
  const mutatedNav = programNavSource.replace(/structuralParentHref/g, "MISSING");
  if (mutatedNav === programNavSource) throw new Error("mutation for ProgramModuleNav.tsx did not change source -- inert");
  if (auditProgramModuleNav(mutatedNav).length === 0) throw new Error("mutation escaped for ProgramModuleNav.tsx");
  caught += 1;

  // Structural-Up files: break the parent navigate target.
  for (let i = 0; i < STRUCTURAL_UP_FILES.length; i++) {
    total += 1;
    const { file, parentHref } = STRUCTURAL_UP_FILES[i];
    const mutated = structuralSources[i].replace(
      new RegExp(`navigate\\(\\s*["']${parentHref.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']\\s*\\)`),
      'navigate("/wrong")',
    );
    if (mutated === structuralSources[i]) throw new Error(`mutation for ${file} did not change source -- inert`);
    if (auditStructuralUp(file, parentHref, mutated).length === 0) {
      throw new Error(`mutation escaped for ${file}`);
    }
    caught += 1;
  }

  console.log(`verify-safety-dispatch-finance-other-back-buttons-wired SELFTEST PASS — ${caught}/${total} mutations detected`);
}

console.log(
  `verify-safety-dispatch-finance-other-back-buttons-wired PASS — ${PAGE_HEADER_FILES.length + FINANCE_PAGE_HEADER_FILES.length} leaf pages have a back control, ProgramModuleNav + ${STRUCTURAL_UP_FILES.length} leaves use structural Up (ROUND 367.9)`,
);
