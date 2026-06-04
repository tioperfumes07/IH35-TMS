#!/usr/bin/env node
/**
 * Block A24-9: Central document expiry alert engine (migration 0350).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const paths = {
  migration: path.join(ROOT, "db/migrations/0350_drivers_document_alerts.sql"),
  service: path.join(ROOT, "apps/backend/src/drivers/document-alerts.service.ts"),
  routes: path.join(ROOT, "apps/backend/src/drivers/document-alerts.routes.ts"),
  cron: path.join(ROOT, "apps/backend/src/drivers/document-alerts.cron.ts"),
  backendRoutesTest: path.join(ROOT, "apps/backend/src/drivers/__tests__/document-alerts.routes.test.ts"),
  backendServiceTest: path.join(ROOT, "apps/backend/src/drivers/__tests__/document-alerts.service.test.ts"),
  alertsPage: path.join(ROOT, "apps/frontend/src/pages/alerts/DocumentAlertsPage.tsx"),
  frontendTest: path.join(ROOT, "apps/frontend/src/pages/alerts/__tests__/DocumentAlertsPage.test.tsx"),
  manifest: path.join(ROOT, "apps/frontend/src/routes/manifest.tsx"),
  index: path.join(ROOT, "apps/backend/src/index.ts"),
  archDesign: path.join(ROOT, "docs/specs/IH35_ARCHITECTURAL_DESIGN.md"),
};

function read(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

function fail(msg) {
  console.error(`[verify-drivers-document-expiry-alerts] ${msg}`);
  process.exit(1);
}

function main() {
  const migration = read(paths.migration);
  const service = read(paths.service);
  const routes = read(paths.routes);
  const cron = read(paths.cron);
  const backendRoutesTest = read(paths.backendRoutesTest);
  const backendServiceTest = read(paths.backendServiceTest);
  const alertsPage = read(paths.alertsPage);
  const frontendTest = read(paths.frontendTest);
  const manifest = read(paths.manifest);
  const index = read(paths.index);
  const archDesign = read(paths.archDesign);
  const failures = [];

  if (!migration.includes("document_alert_rules")) {
    failures.push("Migration 0350 must create document_alert_rules");
  }
  if (!migration.includes("document_alert_events")) {
    failures.push("Migration 0350 must create document_alert_events");
  }
  if (fs.existsSync(path.join(ROOT, "db/migrations/0350_dispatch"))) {
    failures.push("Migration 0350 filename must be drivers document alerts only");
  }
  const migDir = fs.readdirSync(path.join(ROOT, "db/migrations"));
  const other0350 = migDir.filter((f) => f.startsWith("0350_") && f !== "0350_drivers_document_alerts.sql");
  if (other0350.length) failures.push(`Migration 0350 conflict: ${other0350.join(", ")}`);

  if (!service.includes("evaluateDocumentAlertsForTenant")) failures.push("Evaluator service required");
  if (!service.includes("dispatchDocumentAlertNotifications")) failures.push("Notification dispatch required");
  if (!routes.includes("/api/v1/drivers/document-alerts/inbox")) failures.push("Inbox route required");
  if (!routes.includes("/api/v1/drivers/document-alert-rules")) failures.push("Rules route required");
  if (!cron.includes("document_alert_engine_cron")) failures.push("Scheduled cron required");
  if (!index.includes("registerDriversDocumentAlertsRoutes")) failures.push("Routes must register in index.ts");
  if (!index.includes("initializeDocumentAlertEngineCron")) failures.push("Cron must initialize in index.ts");
  if (!alertsPage.includes("DocumentAlertsPage")) failures.push("Document alerts page required");
  if (!manifest.includes("/drivers/alerts")) failures.push("Frontend route /drivers/alerts required");
  if (!backendRoutesTest.includes("A24-9")) failures.push("Backend routes vitest must reference A24-9");
  if (!backendServiceTest.includes("A24-9")) failures.push("Backend service vitest must reference A24-9");
  if (!frontendTest.includes("A24-9")) failures.push("Frontend vitest must reference A24-9");

  if (!archDesign.includes("verify:drivers-document-expiry-alerts")) {
    failures.push("ARCHITECTURAL_DESIGN must reference verify:drivers-document-expiry-alerts");
  }

  if (failures.length) {
    for (const f of failures) console.error(` - ${f}`);
    fail("FAILED");
  }

  console.log("[verify-drivers-document-expiry-alerts] OK");
}

main();
