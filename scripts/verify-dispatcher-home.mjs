#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const paths = {
  backendService: path.join(ROOT, "apps/backend/src/dispatcher-board/role-views/dispatcher.service.ts"),
  backendRoutes: path.join(ROOT, "apps/backend/src/dispatcher-board/role-views/routes.ts"),
  backendIndex: path.join(ROOT, "apps/backend/src/index.ts"),
  frontendHomeRouter: path.join(ROOT, "apps/frontend/src/pages/home/HomePage.tsx"),
  frontendDispatcherHome: path.join(ROOT, "apps/frontend/src/pages/home/roles/DispatcherHome.tsx"),
  frontendKpiBar: path.join(ROOT, "apps/frontend/src/components/home/DispatcherKpiBar.tsx"),
  frontendLoadsPanel: path.join(ROOT, "apps/frontend/src/components/home/DispatcherActiveLoadsPanel.tsx"),
  frontendPendingPanel: path.join(ROOT, "apps/frontend/src/components/home/DispatcherPendingActionsPanel.tsx"),
};

function read(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

function fail(message) {
  console.error(`verify:dispatcher-home FAIL: ${message}`);
  process.exit(1);
}

function main() {
  const service = read(paths.backendService);
  const routes = read(paths.backendRoutes);
  const backendIndex = read(paths.backendIndex);
  const homeRouter = read(paths.frontendHomeRouter);
  const dispatcherHome = read(paths.frontendDispatcherHome);
  const kpiBar = read(paths.frontendKpiBar);
  const loadsPanel = read(paths.frontendLoadsPanel);
  const pendingPanel = read(paths.frontendPendingPanel);
  const failures = [];

  if (!service.includes("getDispatcherHomeData")) failures.push("dispatcher service must export getDispatcherHomeData");
  if (!service.includes("l.dispatcher_user_id = $1::uuid")) failures.push("dispatcher service must scope loads by dispatcher user");
  if (!service.includes("mdata.detention_requests")) failures.push("dispatcher service must read pending detention approvals");
  if (!service.includes("mdata.driver_profile_messages")) failures.push("dispatcher service must read inbound queue");

  if (!routes.includes('app.get("/api/v1/dispatcher-board/home"')) failures.push("backend route /api/v1/dispatcher-board/home missing");
  if (!routes.includes("canReadDispatcherHome")) failures.push("dispatcher route must gate allowed office roles");
  if (!backendIndex.includes("registerDispatcherRoleViewRoutes")) failures.push("backend index must register dispatcher role-view routes");

  if (!homeRouter.includes('case "Owner"')) failures.push("HomePage role router must include owner branch");
  if (!homeRouter.includes('case "Dispatcher"')) failures.push("HomePage role router must include dispatcher branch");
  if (!homeRouter.includes("DispatcherHome")) failures.push("HomePage role router must render DispatcherHome");
  if (!homeRouter.includes("DefaultHome")) failures.push("HomePage role router must keep DefaultHome fallback");

  if (!dispatcherHome.includes("dispatcher-home-view")) failures.push("DispatcherHome must expose root test id");
  if (!dispatcherHome.includes("DispatcherKpiBar")) failures.push("DispatcherHome must render KPI bar");
  if (!dispatcherHome.includes("DispatcherActiveLoadsPanel")) failures.push("DispatcherHome must render active loads panel");
  if (!dispatcherHome.includes("DispatcherPendingActionsPanel")) failures.push("DispatcherHome must render pending actions panel");
  if (!dispatcherHome.includes("/api/v1/dispatcher-board/home")) failures.push("DispatcherHome must call dispatcher home API");
  if (dispatcherHome.includes("DefaultHome")) failures.push("DispatcherHome must not pass through to DefaultHome");

  if (!kpiBar.includes("dispatcher-kpi-bar")) failures.push("DispatcherKpiBar must expose test id");
  if (!loadsPanel.includes("dispatcher-active-loads-panel")) failures.push("DispatcherActiveLoadsPanel must expose test id");
  if (!pendingPanel.includes("dispatcher-pending-actions-panel")) failures.push("DispatcherPendingActionsPanel must expose test id");

  if (failures.length > 0) {
    failures.forEach((entry) => console.error(` - ${entry}`));
    fail(failures.join("; "));
  }

  console.log("verify:dispatcher-home PASS");
}

main();
