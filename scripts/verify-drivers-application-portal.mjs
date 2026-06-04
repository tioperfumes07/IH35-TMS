#!/usr/bin/env node
/**
 * Block A24-12: Pre-hire application portal (migration 0363).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const paths = {
  migration: path.join(ROOT, "db/migrations/0363_identity_driver_applicants.sql"),
  routes: path.join(ROOT, "apps/backend/src/identity/applicants.routes.ts"),
  backendTest: path.join(ROOT, "apps/backend/src/identity/__tests__/applicants.routes.test.ts"),
  applicationPage: path.join(ROOT, "apps/frontend/src/pages/public/ApplicationPage.tsx"),
  pipelinePage: path.join(ROOT, "apps/frontend/src/pages/drivers/ApplicantsPipelinePage.tsx"),
  applicantsApi: path.join(ROOT, "apps/frontend/src/api/applicants.ts"),
  applicationTest: path.join(ROOT, "apps/frontend/src/pages/public/__tests__/ApplicationPage.test.tsx"),
  pipelineTest: path.join(ROOT, "apps/frontend/src/pages/drivers/__tests__/ApplicantsPipelinePage.test.tsx"),
  manifest: path.join(ROOT, "apps/frontend/src/routes/manifest.tsx"),
  index: path.join(ROOT, "apps/backend/src/index.ts"),
  archDesign: path.join(ROOT, "docs/specs/IH35_ARCHITECTURAL_DESIGN.md"),
};

function read(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

function fail(msg) {
  console.error(`[verify-drivers-application-portal] ${msg}`);
  process.exit(1);
}

function main() {
  const migration = read(paths.migration);
  const routes = read(paths.routes);
  const backendTest = read(paths.backendTest);
  const applicationPage = read(paths.applicationPage);
  const pipelinePage = read(paths.pipelinePage);
  const applicantsApi = read(paths.applicantsApi);
  const applicationTest = read(paths.applicationTest);
  const pipelineTest = read(paths.pipelineTest);
  const manifest = read(paths.manifest);
  const index = read(paths.index);
  const archDesign = read(paths.archDesign);
  const failures = [];

  if (!migration.includes("identity.driver_applicants")) failures.push("Migration 0363 must create identity.driver_applicants");
  if (!migration.includes("identity.applicant_documents")) failures.push("Migration 0363 must create identity.applicant_documents");
  if (fs.existsSync(path.join(ROOT, "db/migrations/0351_drivers_applicants.sql"))) {
    failures.push("Must ship as 0363 — 0351 slot superseded");
  }

  if (!routes.includes("/api/v1/public/apply/:token")) failures.push("Public apply route required");
  if (!routes.includes("/api/v1/identity/applicants")) failures.push("Office applicants list route required");
  if (!routes.includes("convert-to-driver")) failures.push("Convert-to-driver route required");
  if (!routes.includes("onboarding_sessions")) failures.push("Convert flow must create onboarding session");
  if (!index.includes("registerIdentityApplicantRoutes")) failures.push("Backend index must register applicant routes");

  if (!applicationPage.includes("ApplicationPage")) failures.push("ApplicationPage required");
  if (!applicationPage.includes("fcra_notice")) failures.push("ApplicationPage must show FCRA compliance notice");
  if (!pipelinePage.includes("ApplicantsPipelinePage")) failures.push("ApplicantsPipelinePage required");
  if (!pipelinePage.includes("Convert to driver")) failures.push("Pipeline must expose convert action");
  if (!applicantsApi.includes("submitDriverApplication")) failures.push("Applicants API client required");
  if (!manifest.includes("/apply/:token")) failures.push("Frontend route /apply/:token required");
  if (!manifest.includes("/drivers/applicants")) failures.push("Frontend route /drivers/applicants required");

  if (!backendTest.includes("A24-12")) failures.push("Backend vitest must reference A24-12");
  const backendTestCount = (backendTest.match(/\bit\s*\(/g) ?? []).length;
  if (backendTestCount < 5) failures.push("Backend vitest must include at least 5 cases");
  if (!applicationTest.includes("A24-12")) failures.push("ApplicationPage vitest must reference A24-12");
  const applicationTestCount = (applicationTest.match(/\bit\s*\(/g) ?? []).length;
  if (applicationTestCount < 4) failures.push("ApplicationPage vitest must include at least 4 cases");
  if (!pipelineTest.includes("A24-12")) failures.push("ApplicantsPipelinePage vitest must reference A24-12");

  if (!archDesign.includes("verify:drivers-application-portal")) {
    failures.push("ARCHITECTURAL_DESIGN must reference verify:drivers-application-portal");
  }

  if (failures.length) {
    for (const f of failures) console.error(` - ${f}`);
    fail("FAILED");
  }

  console.log("[verify-drivers-application-portal] OK");
}

main();
