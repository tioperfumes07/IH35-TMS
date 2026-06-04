#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.env.VERIFY_SAFETY_INCIDENTS_CLUSTER_ROOT ?? process.cwd();

const paths = {
  migration: path.join(ROOT, "db/migrations/0345_safety_incidents.sql"),
  routes: path.join(ROOT, "apps/backend/src/safety/incidents.routes.ts"),
  index: path.join(ROOT, "apps/backend/src/index.ts"),
  backendTests: path.join(ROOT, "apps/backend/src/safety/__tests__/incidents.routes.test.ts"),
  damagePage: path.join(ROOT, "apps/frontend/src/pages/safety/DamageReportsPage.tsx"),
  trailerPage: path.join(ROOT, "apps/frontend/src/pages/safety/TrailerInterchangesPage.tsx"),
  cargoPage: path.join(ROOT, "apps/frontend/src/pages/safety/CargoClaimsPage.tsx"),
  damageTab: path.join(ROOT, "apps/frontend/src/pages/safety/tabs/DamageReportsTab.tsx"),
  trailerTab: path.join(ROOT, "apps/frontend/src/pages/safety/tabs/TrailerInterchangesTab.tsx"),
  cargoTab: path.join(ROOT, "apps/frontend/src/pages/safety/tabs/CargoClaimsTab.tsx"),
  tabsConfig: path.join(ROOT, "apps/frontend/src/components/safety/SAFETY_TABS_CONFIG.ts"),
  frontendTests: path.join(ROOT, "apps/frontend/src/pages/safety/__tests__/IncidentsClusterPages.test.tsx"),
};

function read(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

function main() {
  const failures = [];
  for (const [label, filePath] of Object.entries(paths)) {
    if (!fs.existsSync(filePath)) failures.push(`missing required file: ${label}`);
  }

  const migration = read(paths.migration);
  const routes = read(paths.routes);
  const index = read(paths.index);
  const backendTests = read(paths.backendTests);
  const damagePage = read(paths.damagePage);
  const trailerPage = read(paths.trailerPage);
  const cargoPage = read(paths.cargoPage);
  const damageTab = read(paths.damageTab);
  const trailerTab = read(paths.trailerTab);
  const cargoTab = read(paths.cargoTab);
  const tabsConfig = read(paths.tabsConfig);
  const frontendTests = read(paths.frontendTests);

  if (!migration.includes("CREATE TABLE IF NOT EXISTS safety.incidents")) {
    failures.push("migration 0345 must create safety.incidents");
  }
  if (!migration.includes("incident_type IN ('damage_report', 'trailer_interchange', 'cargo_claim')")) {
    failures.push("migration 0345 must define incident_type enum values");
  }

  if (!routes.includes('app.get("/api/v1/safety/incidents"')) {
    failures.push("incidents routes must expose list endpoint");
  }
  if (!routes.includes('app.post("/api/v1/safety/incidents"')) {
    failures.push("incidents routes must expose create endpoint");
  }
  if (!routes.includes('app.post("/api/v1/safety/incidents/:id/photos"')) {
    failures.push("incidents routes must expose photo upload endpoint");
  }
  if (!index.includes("registerSafetyIncidentsRoutes")) {
    failures.push("backend index must register safety incidents routes");
  }

  const backendTestCount = (backendTests.match(/\bit\(/g) ?? []).length;
  if (backendTestCount < 6) {
    failures.push("incidents.routes.test.ts must include at least 6 vitest cases");
  }

  for (const [label, source, testId] of [
    ["DamageReportsPage", damagePage, "damage-reports-page"],
    ["TrailerInterchangesPage", trailerPage, "trailer-interchanges-page"],
    ["CargoClaimsPage", cargoPage, "cargo-claims-page"],
  ]) {
    if (!source.includes(`data-testid="${testId}"`) && !source.includes("SafetyIncidentsClusterSurface")) {
      failures.push(`${label} must wire incidents cluster surface`);
    }
    if (source.includes("+ New") || source.includes("+ Add ")) {
      failures.push(`${label} must not use non-canonical + New / + Add vocabulary`);
    }
  }

  if (!cargoPage.includes("insurance.claim lacks cargo")) {
    failures.push("CargoClaimsPage must document RBC decision vs insurance.claim redirect");
  }

  for (const [tabId, tabSource, pageName] of [
    ["damage-reports", damageTab, "DamageReportsPage"],
    ["trailer-interchanges", trailerTab, "TrailerInterchangesPage"],
    ["cargo-claims", cargoTab, "CargoClaimsPage"],
  ]) {
    if (!tabsConfig.includes(`id: "${tabId}"`) || !tabsConfig.match(new RegExp(`id:\\s*"${tabId}"[\\s\\S]*?status:\\s*"Live"`))) {
      failures.push(`SAFETY_TABS_CONFIG ${tabId} tab must be Live`);
    }
    if (!tabSource.includes(pageName)) {
      failures.push(`${tabId} tab wrapper must render ${pageName}`);
    }
  }

  const frontendTestCount = (frontendTests.match(/\bit\(/g) ?? []).length;
  if (frontendTestCount < 3) {
    failures.push("IncidentsClusterPages.test.tsx must include at least 3 vitest cases");
  }

  if (failures.length > 0) {
    console.error("verify:safety-incidents-cluster-wire FAILED");
    for (const failure of failures) console.error(` - ${failure}`);
    process.exit(1);
  }

  console.log("verify:safety-incidents-cluster-wire OK");
}

main();
