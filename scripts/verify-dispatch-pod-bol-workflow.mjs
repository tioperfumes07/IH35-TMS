#!/usr/bin/env node
/**
 * Block B21-D10: POD capture + BOL generation workflow.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const paths = {
  migration: path.join(ROOT, "db/migrations/0356_dispatch_pod_bol.sql"),
  page: path.join(ROOT, "apps/frontend/src/pages/dispatch/PodReviewPage.tsx"),
  pageTest: path.join(ROOT, "apps/frontend/src/pages/dispatch/__tests__/PodReviewPage.test.tsx"),
  routes: path.join(ROOT, "apps/backend/src/dispatch/pod.routes.ts"),
  bol: path.join(ROOT, "apps/backend/src/dispatch/bol-generator.service.ts"),
  routeTest: path.join(ROOT, "apps/backend/src/dispatch/__tests__/pod-bol.routes.test.ts"),
  podCapture: path.join(ROOT, "apps/driver-pwa/src/components/PodCapture.tsx"),
  podCaptureTest: path.join(ROOT, "apps/driver-pwa/src/pages/__tests__/PodCapture.test.ts"),
  portal: path.join(ROOT, "apps/backend/src/shipper-portal/portal-api.routes.ts"),
  index: path.join(ROOT, "apps/backend/src/index.ts"),
  dispatchApi: path.join(ROOT, "apps/frontend/src/api/dispatch.ts"),
  manifest: path.join(ROOT, "apps/frontend/src/routes/manifest.tsx"),
  sidebar: path.join(ROOT, "apps/frontend/src/components/layout/sidebar-config.ts"),
  stopAction: path.join(ROOT, "apps/driver-pwa/src/pages/StopAction.tsx"),
  archDesign: path.join(ROOT, "docs/specs/IH35_ARCHITECTURAL_DESIGN.md"),
};

function read(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

function fail(msg) {
  console.error(`verify:dispatch-pod-bol-workflow FAIL: ${msg}`);
  process.exit(1);
}

function main() {
  const migration = read(paths.migration);
  const page = read(paths.page);
  const pageTest = read(paths.pageTest);
  const routes = read(paths.routes);
  const bol = read(paths.bol);
  const routeTest = read(paths.routeTest);
  const podCapture = read(paths.podCapture);
  const podCaptureTest = read(paths.podCaptureTest);
  const portal = read(paths.portal);
  const index = read(paths.index);
  const dispatchApi = read(paths.dispatchApi);
  const manifest = read(paths.manifest);
  const sidebar = read(paths.sidebar);
  const stopAction = read(paths.stopAction);
  const archDesign = read(paths.archDesign);
  const failures = [];

  if (!migration.includes("dispatch.pod_documents")) failures.push("migration 0356 must create pod_documents");
  if (!migration.includes("dispatch.bol_documents")) failures.push("migration 0356 must create bol_documents");
  if (!page.includes("dispatch-pod-review-page")) failures.push("PodReviewPage must expose test id");
  if (!page.includes("pod-review-panel")) failures.push("PodReviewPage must expose review panel");
  if (!page.includes("Download BOL PDF")) failures.push("PodReviewPage must expose BOL download");
  if ((pageTest.match(/\bit\(/g) ?? []).length < 4) failures.push("PodReviewPage tests must cover at least 4 cases");
  if ((routeTest.match(/\bit\(/g) ?? []).length < 6) failures.push("pod-bol routes tests must cover at least 6 cases");
  if ((podCaptureTest.match(/\bit\(/g) ?? []).length < 2) failures.push("PodCapture tests must cover at least 2 cases");

  if (!routes.includes("/api/v1/driver/loads/:loadId/stops/:stopId/pod")) failures.push("routes must expose driver POD capture");
  if (!routes.includes("/api/v1/dispatch/pod-documents")) failures.push("routes must expose office POD list");
  if (!routes.includes("/api/v1/dispatch/loads/:loadId/bol/generate")) failures.push("routes must expose BOL generate");
  if (!routes.includes("/api/v1/dispatch/loads/:loadId/bol.pdf")) failures.push("routes must expose BOL PDF download");
  if (!bol.includes("generateBolPdf")) failures.push("bol generator must render PDF from load data");
  if (!bol.includes("fetchBolPayload")) failures.push("bol generator must fetch load/customer/stops");
  if (!index.includes("registerDispatchPodBolRoutes")) failures.push("backend index must register pod/bol routes");

  if (!podCapture.includes("SignaturePad")) failures.push("PodCapture must include signature pad");
  if (!podCapture.includes("capture=\"environment\"")) failures.push("PodCapture must support camera capture");
  if (!stopAction.includes("PodCapture")) failures.push("StopAction must integrate PodCapture for delivery stops");

  if (!dispatchApi.includes("getPodDocuments")) failures.push("dispatch API must export getPodDocuments");
  if (!dispatchApi.includes("generateLoadBol")) failures.push("dispatch API must export generateLoadBol");
  if (!manifest.includes('path="/dispatch/pod-review"')) failures.push("manifest must route /dispatch/pod-review");

  const dispatchFlyout = sidebar.split('case "dispatch"')[1]?.split("case ")[0] ?? "";
  if (!dispatchFlyout.includes("/dispatch/pod-review")) failures.push("sidebar flyout must link POD review");

  if (!portal.includes("dispatch.pod_documents")) failures.push("portal must surface approved POD documents");
  if (!portal.includes("dispatch.bol_documents")) failures.push("portal must surface generated BOL documents");

  if (!archDesign.includes("verify:dispatch-pod-bol-workflow")) {
    failures.push("ARCHITECTURAL_DESIGN must reference verify:dispatch-pod-bol-workflow");
  }

  if (failures.length) {
    for (const f of failures) console.error(` - ${f}`);
    fail(failures.join("; "));
  }

  console.log("verify:dispatch-pod-bol-workflow PASS");
}

main();
