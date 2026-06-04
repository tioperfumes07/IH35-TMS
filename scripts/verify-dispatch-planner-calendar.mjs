#!/usr/bin/env node
/**
 * Block B21-D4: Dispatch planner calendar week view with drag-drop reschedule + HOS overlay.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const paths = {
  page: path.join(ROOT, "apps/frontend/src/pages/dispatch/PlannerCalendarPage.tsx"),
  pageTest: path.join(ROOT, "apps/frontend/src/pages/dispatch/__tests__/PlannerCalendarPage.test.tsx"),
  routes: path.join(ROOT, "apps/backend/src/dispatch/planner.routes.ts"),
  service: path.join(ROOT, "apps/backend/src/dispatch/planner.service.ts"),
  routeTest: path.join(ROOT, "apps/backend/src/dispatch/__tests__/planner.routes.test.ts"),
  index: path.join(ROOT, "apps/backend/src/index.ts"),
  dispatchApi: path.join(ROOT, "apps/frontend/src/api/dispatch.ts"),
  manifest: path.join(ROOT, "apps/frontend/src/routes/manifest.tsx"),
  sidebar: path.join(ROOT, "apps/frontend/src/components/layout/sidebar-config.ts"),
  archDesign: path.join(ROOT, "docs/specs/IH35_ARCHITECTURAL_DESIGN.md"),
};

function read(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

function fail(msg) {
  console.error(`verify:dispatch-planner-calendar FAIL: ${msg}`);
  process.exit(1);
}

function main() {
  const page = read(paths.page);
  const pageTest = read(paths.pageTest);
  const routes = read(paths.routes);
  const service = read(paths.service);
  const routeTest = read(paths.routeTest);
  const index = read(paths.index);
  const dispatchApi = read(paths.dispatchApi);
  const manifest = read(paths.manifest);
  const sidebar = read(paths.sidebar);
  const archDesign = read(paths.archDesign);
  const failures = [];

  if (!page.includes("dispatch-planner-calendar-page")) failures.push("PlannerCalendarPage must expose test id");
  if (!page.includes("HOS overlay")) failures.push("PlannerCalendarPage must expose HOS overlay toggle");
  if (!page.includes("DndContext")) failures.push("PlannerCalendarPage must use drag-drop reschedule");
  if ((pageTest.match(/\bit\(/g) ?? []).length < 5) failures.push("PlannerCalendarPage tests must cover at least 5 cases");
  if ((routeTest.match(/\bit\(/g) ?? []).length < 3) failures.push("planner.routes tests must cover at least 3 cases");

  if (!routes.includes("/api/v1/dispatch/planner/week")) failures.push("planner routes must expose week endpoint");
  if (!routes.includes("/api/v1/dispatch/planner/loads/:id/start_at")) {
    failures.push("planner routes must patch load start_at");
  }
  if (!service.includes("detectPlannerConflict")) failures.push("planner service must detect schedule conflicts");
  if (!service.includes("hos.duty_status_events")) failures.push("planner service must read HOS blackout events");
  if (!index.includes("registerDispatchPlannerRoutes")) failures.push("backend index must register planner routes");

  if (!dispatchApi.includes("getDispatchPlannerWeek")) failures.push("dispatch API must export getDispatchPlannerWeek");
  if (!dispatchApi.includes("patchDispatchPlannerLoadStartAt")) {
    failures.push("dispatch API must export patchDispatchPlannerLoadStartAt");
  }
  if (!manifest.includes('path="/dispatch/planner"')) failures.push("manifest must route /dispatch/planner");

  const dispatchFlyout = sidebar.split('case "dispatch"')[1]?.split("case ")[0] ?? "";
  if (!dispatchFlyout.includes("/dispatch/planner")) failures.push("sidebar flyout must link planner calendar");

  if (!archDesign.includes("verify:dispatch-planner-calendar")) {
    failures.push("ARCHITECTURAL_DESIGN must reference verify:dispatch-planner-calendar");
  }

  if (failures.length) {
    for (const f of failures) console.error(` - ${f}`);
    fail(failures.join("; "));
  }

  console.log("verify:dispatch-planner-calendar PASS");
}

main();
