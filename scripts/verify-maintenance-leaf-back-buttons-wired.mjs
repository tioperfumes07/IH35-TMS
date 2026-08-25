#!/usr/bin/env node
/**
 * UI-BACK-BUTTON-MISSING-ENTIRELY — audit wave 3 (Maintenance). Owner report (2026-08-25): "many
 * leafs or tabs are missing the back arrow return button." A systemwide route-manifest audit found
 * 13 routed /maintenance/* leaf pages with NO shared wrapper (unlike Accounting's
 * AccountingSubNavWrapper) and NO back control at all -- each had its own bespoke title bar. 12 of
 * the 13 now render the standard PageHeader with backHref="/maintenance" (the Maintenance module
 * hub); the 13th, WorkOrderNewPage.tsx, is a modal-only deep-link route that already returns to
 * /maintenance on close and is correctly excluded. DefectDetailPage.tsx additionally had a REAL but
 * hardcoded back <Link> (a UI-BACK-BUTTON-IGNORES-REAL-NAVIGATION-HISTORY instance, not a missing
 * one) -- upgraded to the same smart-back pattern as the rest of the app.
 */
import fs from "node:fs";

const PAGE_HEADER_FILES = [
  "apps/frontend/src/pages/maintenance/vehicles/VehiclesMasterDataPage.tsx",
  "apps/frontend/src/pages/maintenance/drivers/DriversMasterDataPage.tsx",
  "apps/frontend/src/pages/maintenance/parts/PartsMasterDataPage.tsx",
  "apps/frontend/src/pages/maintenance/pm-schedule/PmSchedulePage.tsx",
  "apps/frontend/src/pages/maintenance/PmAutoEnginePage.tsx",
  "apps/frontend/src/pages/maintenance/MaintKpiDashboardPage.tsx",
  "apps/frontend/src/pages/maintenance/inspections/InspectionsPage.tsx",
  "apps/frontend/src/pages/maintenance/TireProgramPage.tsx",
  "apps/frontend/src/pages/maintenance/WarrantyClaimsPage.tsx",
  "apps/frontend/src/pages/maintenance/reports/MaintenanceReportsPage.tsx",
  "apps/frontend/src/pages/maintenance/compliance/Compliance425CPage.tsx",
];

const DEFECT_DETAIL_FILE = "apps/frontend/src/pages/maintenance/DefectDetailPage.tsx";

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
}

function auditPageHeaderFile(file, source) {
  const failures = [];
  const stripped = stripComments(source);
  if (!/import\s*\{\s*PageHeader\s*\}\s*from\s*["'][./]*components\/forms\/shared\/PageHeader["']/.test(stripped)) {
    failures.push(`${file}: must import the shared PageHeader component`);
  }
  if (!/<PageHeader\b/.test(stripped)) {
    failures.push(`${file}: must render <PageHeader ...> -- it had no back control at all`);
  }
  if (!/backHref=["']\/maintenance["']/.test(stripped)) {
    failures.push(`${file}: PageHeader must set backHref="/maintenance" (the module hub)`);
  }
  return failures;
}

function auditDefectDetail(source) {
  const failures = [];
  const stripped = stripComments(source);
  if (!/import\s*\{\s*hasInAppHistory\s*\}\s*from\s*["'][./]*lib\/smart-back["']/.test(stripped)) {
    failures.push(`${DEFECT_DETAIL_FILE}: must import hasInAppHistory from the shared smart-back helper`);
  }
  const historyIdx = stripped.indexOf("hasInAppHistory(window.history.state)");
  const fallbackIdx = stripped.indexOf('navigate("/maintenance/defects")');
  if (historyIdx < 0 || fallbackIdx < 0 || historyIdx > fallbackIdx) {
    failures.push(
      `${DEFECT_DETAIL_FILE}: the hasInAppHistory check must run BEFORE the /maintenance/defects fallback`
    );
  }
  return failures;
}

const sources = PAGE_HEADER_FILES.map((f) => fs.readFileSync(f, "utf8"));
const defectSource = fs.readFileSync(DEFECT_DETAIL_FILE, "utf8");

let failures = [];
sources.forEach((src, i) => {
  failures = failures.concat(auditPageHeaderFile(PAGE_HEADER_FILES[i], src));
});
failures = failures.concat(auditDefectDetail(defectSource));

if (failures.length) {
  console.error(`verify-maintenance-leaf-back-buttons-wired FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  let caught = 0;
  let total = 0;

  // One planted mutation per PageHeader file: remove the <PageHeader back control entirely.
  for (let i = 0; i < PAGE_HEADER_FILES.length; i++) {
    total += 1;
    const mutated = sources[i].replace(/<PageHeader\b[\s\S]*?\/>/, "<div />");
    if (mutated === sources[i]) throw new Error(`mutation for ${PAGE_HEADER_FILES[i]} did not change source -- inert`);
    const mutSources = [...sources];
    mutSources[i] = mutated;
    const mutFailures = mutSources.flatMap((src, j) => auditPageHeaderFile(PAGE_HEADER_FILES[j], src));
    if (mutFailures.length === 0) throw new Error(`mutation escaped for ${PAGE_HEADER_FILES[i]}`);
    caught += 1;
  }

  // DefectDetailPage: reorder so the fallback runs before the history check (dead-codes the fix).
  total += 1;
  const mutatedDefect = defectSource.replace(
    `if (hasInAppHistory(window.history.state)) {
              navigate(-1);
              return;
            }
            navigate("/maintenance/defects");`,
    `navigate("/maintenance/defects");
            if (hasInAppHistory(window.history.state)) {
              navigate(-1);
              return;
            }`
  );
  if (mutatedDefect === defectSource) throw new Error("mutation for DefectDetailPage.tsx did not change source -- inert");
  const mutDefectFailures = auditDefectDetail(mutatedDefect);
  if (mutDefectFailures.length === 0) throw new Error("mutation escaped for DefectDetailPage.tsx");
  caught += 1;

  console.log(`verify-maintenance-leaf-back-buttons-wired SELFTEST PASS — ${caught}/${total} mutations detected`);
}

console.log(
  `verify-maintenance-leaf-back-buttons-wired PASS — all 12 Maintenance leaf pages have a back control (${PAGE_HEADER_FILES.length} via PageHeader + 1 smart-back link)`
);
