#!/usr/bin/env node
/**
 * Block A24-8: Multi-step driver onboarding wizard with save+resume.
 * Migration 0361 (0349 reserved for A24-10 comm center; 0360 for B28).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const paths = {
  migration: path.join(ROOT, "db/migrations/0361_safety_onboarding_sessions.sql"),
  onboardingRoutes: path.join(ROOT, "apps/backend/src/safety/onboarding.routes.ts"),
  backendTest: path.join(ROOT, "apps/backend/src/safety/__tests__/onboarding.routes.test.ts"),
  wizardPage: path.join(ROOT, "apps/frontend/src/pages/drivers/OnboardingWizardPage.tsx"),
  frontendTest: path.join(ROOT, "apps/frontend/src/pages/drivers/__tests__/OnboardingWizardPage.test.tsx"),
  manifest: path.join(ROOT, "apps/frontend/src/routes/manifest.tsx"),
  index: path.join(ROOT, "apps/backend/src/index.ts"),
  archDesign: path.join(ROOT, "docs/specs/IH35_ARCHITECTURAL_DESIGN.md"),
};

function read(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

function fail(msg) {
  console.error(`[verify-drivers-onboarding-wizard] ${msg}`);
  process.exit(1);
}

function main() {
  const migration = read(paths.migration);
  const onboardingRoutes = read(paths.onboardingRoutes);
  const backendTest = read(paths.backendTest);
  const wizardPage = read(paths.wizardPage);
  const frontendTest = read(paths.frontendTest);
  const manifest = read(paths.manifest);
  const index = read(paths.index);
  const archDesign = read(paths.archDesign);
  const failures = [];

  if (!migration.includes("safety.onboarding_sessions")) {
    failures.push("Migration 0361 must create safety.onboarding_sessions");
  }
  if (migration.includes("0349_safety_onboarding")) {
    failures.push("Must not use migration 0349 (comm center conflict)");
  }
  if (!onboardingRoutes.includes("/api/v1/safety/onboarding/sessions")) {
    failures.push("Backend onboarding session routes required");
  }
  if (!onboardingRoutes.includes("admin-override")) {
    failures.push("Admin override endpoint required");
  }
  if (!index.includes("registerSafetyOnboardingRoutes")) {
    failures.push("Backend index must register onboarding routes");
  }
  if (!wizardPage.includes("OnboardingWizardPage")) {
    failures.push("OnboardingWizardPage required");
  }
  if (!wizardPage.includes("requestUploadUrl")) {
    failures.push("Wizard must upload via docs module");
  }
  if (!manifest.includes("/drivers/onboarding/:session_id")) {
    failures.push("Frontend route /drivers/onboarding/:session_id required");
  }
  if (!backendTest.includes("A24-8")) failures.push("Backend vitest must reference A24-8");
  const backendTestCount = (backendTest.match(/\bit\s*\(/g) ?? []).length;
  if (backendTestCount < 6) failures.push("Backend vitest must include at least 6 cases");
  if (!frontendTest.includes("A24-8")) failures.push("Frontend vitest must reference A24-8");
  const frontendTestCount = (frontendTest.match(/\bit\s*\(/g) ?? []).length;
  if (frontendTestCount < 4) failures.push("Frontend vitest must include at least 4 cases");

  if (!archDesign.includes("verify:drivers-onboarding-wizard")) {
    failures.push("ARCHITECTURAL_DESIGN must reference verify:drivers-onboarding-wizard");
  }

  if (failures.length) {
    for (const f of failures) console.error(` - ${f}`);
    fail("FAILED");
  }

  console.log("[verify-drivers-onboarding-wizard] OK");
}

main();
