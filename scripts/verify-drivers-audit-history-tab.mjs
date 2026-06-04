#!/usr/bin/env node
/**
 * Block A24-6: DriverDetail Audit History tab drill-down on audit.audit_events.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const paths = {
  driverEventsRoutes: path.join(ROOT, "apps/backend/src/audit/driver-events.routes.ts"),
  driverEventsService: path.join(ROOT, "apps/backend/src/audit/driver-events.service.ts"),
  auditHistoryTab: path.join(ROOT, "apps/frontend/src/components/drivers/AuditHistoryTab.tsx"),
  driverDetail: path.join(ROOT, "apps/frontend/src/pages/DriverDetail.tsx"),
  auditApi: path.join(ROOT, "apps/frontend/src/api/audit.ts"),
  backendTest: path.join(ROOT, "apps/backend/src/audit/__tests__/driver-events.routes.test.ts"),
  frontendTest: path.join(ROOT, "apps/frontend/src/components/drivers/__tests__/AuditHistoryTab.test.tsx"),
  archDesign: path.join(ROOT, "docs/specs/IH35_ARCHITECTURAL_DESIGN.md"),
};

function read(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

function fail(msg) {
  console.error(`[verify-drivers-audit-history-tab] ${msg}`);
  process.exit(1);
}

function main() {
  const driverEventsRoutes = read(paths.driverEventsRoutes);
  const driverEventsService = read(paths.driverEventsService);
  const auditHistoryTab = read(paths.auditHistoryTab);
  const driverDetail = read(paths.driverDetail);
  const auditApi = read(paths.auditApi);
  const backendTest = read(paths.backendTest);
  const frontendTest = read(paths.frontendTest);
  const archDesign = read(paths.archDesign);
  const failures = [];

  if (!driverEventsRoutes.includes("/api/v1/audit/events")) failures.push("GET /api/v1/audit/events route required");
  if (!driverEventsRoutes.includes('entity_type: z.literal("driver")')) {
    failures.push("Route must require entity_type=driver");
  }
  if (!driverEventsService.includes("audit.audit_events")) failures.push("Service must query audit.audit_events");
  if (!driverEventsService.includes("resource_id")) failures.push("Service must match driver resource_id payloads");
  if (!auditApi.includes('entity_type: "driver"')) failures.push("Frontend API must pass entity_type driver");
  if (!auditHistoryTab.includes('data-testid="driver-audit-history-tab"')) {
    failures.push("AuditHistoryTab must expose driver-audit-history-tab test id");
  }
  if (!auditHistoryTab.includes("driver-audit-expand")) failures.push("AuditHistoryTab must support row expand");
  if (!auditHistoryTab.includes("ARCHIVE (A24-6)")) failures.push("AuditHistoryTab must archive prior placeholder");
  if (!driverDetail.includes("<AuditHistoryTab")) failures.push("DriverDetail must render AuditHistoryTab");
  if (driverDetail.includes("Audit history viewer placeholder")) {
    failures.push("DriverDetail must not retain audit placeholder copy");
  }
  if (!backendTest.includes("A24-6")) failures.push("Backend vitest must reference A24-6");
  if (!frontendTest.includes("A24-6")) failures.push("Frontend vitest must reference A24-6");
  const testCount = (frontendTest.match(/\bit\s*\(/g) ?? []).length;
  if (testCount < 3) failures.push("AuditHistoryTab.test.tsx must include at least 3 vitest cases");

  if (!archDesign.includes("verify:drivers-audit-history-tab")) {
    failures.push("ARCHITECTURAL_DESIGN must reference verify:drivers-audit-history-tab");
  }

  if (failures.length) {
    for (const f of failures) console.error(` - ${f}`);
    fail("FAILED");
  }

  console.log("[verify-drivers-audit-history-tab] OK");
}

main();
