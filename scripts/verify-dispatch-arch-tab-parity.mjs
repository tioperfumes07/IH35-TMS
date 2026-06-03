#!/usr/bin/env node
/**
 * Block B21-D2: Dispatch arch tab parity phase 1 — At-Risk, In-Transit Issues, Assignment History.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const paths = {
  atRiskPage: path.join(ROOT, "apps/frontend/src/pages/dispatch/AtRiskQueuePage.tsx"),
  intransitPage: path.join(ROOT, "apps/frontend/src/pages/dispatch/InTransitIssuesPage.tsx"),
  historyPage: path.join(ROOT, "apps/frontend/src/pages/dispatch/AssignmentHistoryPage.tsx"),
  routes: path.join(ROOT, "apps/backend/src/dispatch/arch-tabs.routes.ts"),
  service: path.join(ROOT, "apps/backend/src/dispatch/arch-tabs.service.ts"),
  index: path.join(ROOT, "apps/backend/src/index.ts"),
  manifest: path.join(ROOT, "apps/frontend/src/routes/manifest.tsx"),
  sidebar: path.join(ROOT, "apps/frontend/src/components/layout/sidebar-config.ts"),
  dispatchApi: path.join(ROOT, "apps/frontend/src/api/dispatch.ts"),
  archDesign: path.join(ROOT, "docs/specs/IH35_ARCHITECTURAL_DESIGN.md"),
};

function read(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

function fail(msg) {
  console.error(`[verify-dispatch-arch-tab-parity] ${msg}`);
  process.exit(1);
}

function main() {
  const atRiskPage = read(paths.atRiskPage);
  const intransitPage = read(paths.intransitPage);
  const historyPage = read(paths.historyPage);
  const routes = read(paths.routes);
  const service = read(paths.service);
  const index = read(paths.index);
  const manifest = read(paths.manifest);
  const sidebar = read(paths.sidebar);
  const dispatchApi = read(paths.dispatchApi);
  const archDesign = read(paths.archDesign);
  const failures = [];

  if (!atRiskPage.includes("dispatch-at-risk-page")) failures.push("AtRiskQueuePage must expose test id");
  if (!intransitPage.includes("+ Create Issue")) failures.push("InTransitIssuesPage must expose create flow");
  if (!historyPage.includes("dispatch-assignment-history-page")) failures.push("AssignmentHistoryPage must expose test id");

  if (!routes.includes("/api/v1/dispatch/at-risk-loads")) failures.push("arch-tabs routes must expose at-risk endpoint");
  if (!routes.includes("/api/v1/dispatch/intransit-issues")) failures.push("arch-tabs routes must list intransit issues");
  if (!routes.includes("/api/v1/dispatch/assignment-history")) failures.push("arch-tabs routes must list assignment history");
  if (!service.includes("dispatch.load_assignment_history")) failures.push("service must query assignment history table");
  if (!index.includes("registerDispatchArchTabsRoutes")) failures.push("backend index must register arch tab routes");

  if (!manifest.includes('path="/dispatch/at-risk"')) failures.push("manifest must route /dispatch/at-risk");
  if (!manifest.includes('path="/dispatch/in-transit-issues"')) failures.push("manifest must route in-transit issues");
  if (!manifest.includes('path="/dispatch/assignment-history"')) failures.push("manifest must route assignment history");

  const dispatchFlyout = sidebar.split('case "dispatch"')[1]?.split("case ")[0] ?? "";
  if (!dispatchFlyout.includes("/dispatch/at-risk")) failures.push("sidebar flyout must link at-risk tab");
  if (!dispatchFlyout.includes("/dispatch/in-transit-issues")) failures.push("sidebar flyout must link in-transit issues");
  if (!dispatchFlyout.includes("/dispatch/assignment-history")) failures.push("sidebar flyout must link assignment history");

  if (!dispatchApi.includes("listAtRiskDispatchLoads")) failures.push("dispatch API must export listAtRiskDispatchLoads");
  if (!archDesign.includes("verify:dispatch-arch-tab-parity")) {
    failures.push("ARCHITECTURAL_DESIGN must reference verify:dispatch-arch-tab-parity");
  }

  if (failures.length) {
    for (const f of failures) console.error(` - ${f}`);
    fail("FAILED");
  }

  console.log("[verify-dispatch-arch-tab-parity] OK");
}

main();
