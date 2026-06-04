#!/usr/bin/env node
/**
 * Block B31: Service history timeline (vehicle + trailer profiles).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const paths = {
  service: path.join(ROOT, "apps/backend/src/maintenance/service-timeline.service.ts"),
  serviceTest: path.join(ROOT, "apps/backend/src/maintenance/__tests__/service-timeline.service.test.ts"),
  component: path.join(ROOT, "apps/frontend/src/components/maintenance/ServiceTimeline.tsx"),
  componentTest: path.join(ROOT, "apps/frontend/src/components/maintenance/__tests__/ServiceTimeline.test.tsx"),
  vehicleProfile: path.join(ROOT, "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx"),
  trailerProfile: path.join(ROOT, "apps/frontend/src/pages/fleet/TrailerProfilePage.tsx"),
  maintenanceApi: path.join(ROOT, "apps/frontend/src/api/maintenance.ts"),
  index: path.join(ROOT, "apps/backend/src/index.ts"),
  archDesign: path.join(ROOT, "docs/specs/IH35_ARCHITECTURAL_DESIGN.md"),
};

function read(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

function fail(msg) {
  console.error(`verify:maint-service-history-timeline FAIL: ${msg}`);
  process.exit(1);
}

function main() {
  const failures = [];
  const service = read(paths.service);
  const serviceTest = read(paths.serviceTest);
  const component = read(paths.component);
  const componentTest = read(paths.componentTest);
  const vehicleProfile = read(paths.vehicleProfile);
  const trailerProfile = read(paths.trailerProfile);
  const maintenanceApi = read(paths.maintenanceApi);
  const index = read(paths.index);
  const archDesign = read(paths.archDesign);

  if (!service.includes("aggregateServiceTimeline")) failures.push("service must export aggregateServiceTimeline");
  if (!service.includes('app.get("/api/v1/maintenance/service-timeline"')) {
    failures.push("service must expose service-timeline endpoint");
  }
  if (!service.includes("maintenance.work_orders")) failures.push("service must aggregate work orders");
  if (!service.includes("maintenance.inspections")) failures.push("service must aggregate inspections");
  if (!service.includes("fuel.fuel_transactions")) failures.push("service must aggregate fuel events");
  if (!service.includes("ARCHIVE-not-DELETE")) failures.push("service must document ARCHIVE-not-DELETE sunset");
  if ((serviceTest.match(/\bit\(/g) ?? []).length < 3) {
    failures.push("service-timeline.service.test must include at least 3 vitest cases");
  }

  if (!component.includes("data-testid=\"service-timeline\"")) failures.push("ServiceTimeline must expose test id");
  if (!component.includes("service-timeline-type-filters")) failures.push("ServiceTimeline must expose type filters");
  if (!component.includes("navigate(event.detail_path)")) failures.push("ServiceTimeline must drill down via detail_path");
  if ((componentTest.match(/\bit\(/g) ?? []).length < 3) {
    failures.push("ServiceTimeline.test must include at least 3 vitest cases");
  }

  if (!vehicleProfile.includes("<ServiceTimeline")) failures.push("VehicleProfilePage must mount ServiceTimeline");
  if (!trailerProfile.includes("<ServiceTimeline")) failures.push("TrailerProfilePage must mount ServiceTimeline");
  if (!trailerProfile.includes("equipmentId={id}")) failures.push("TrailerProfilePage must pass equipmentId scope");

  if (!maintenanceApi.includes("getMaintenanceServiceTimeline")) {
    failures.push("maintenance API must expose getMaintenanceServiceTimeline");
  }
  if (!index.includes("registerMaintenanceServiceTimelineRoutes")) {
    failures.push("backend index must register service timeline routes");
  }
  if (!archDesign.includes("verify:maint-service-history-timeline")) {
    failures.push("ARCHITECTURAL_DESIGN must reference verify:maint-service-history-timeline");
  }

  if (failures.length) {
    for (const f of failures) console.error(` - ${f}`);
    fail(failures.join("; "));
  }

  console.log("verify:maint-service-history-timeline PASS");
}

main();
