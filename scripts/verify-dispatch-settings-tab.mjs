#!/usr/bin/env node
/**
 * Block B21-D11: Dispatch settings tab — UI bound to GET/PATCH /api/v1/dispatch/preferences.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const paths = {
  page: path.join(ROOT, "apps/frontend/src/pages/dispatch/DispatchSettingsPage.tsx"),
  pageTest: path.join(ROOT, "apps/frontend/src/pages/dispatch/__tests__/DispatchSettingsPage.test.tsx"),
  dispatchApi: path.join(ROOT, "apps/frontend/src/api/dispatch.ts"),
  manifest: path.join(ROOT, "apps/frontend/src/routes/manifest.tsx"),
  sidebar: path.join(ROOT, "apps/frontend/src/components/layout/sidebar-config.ts"),
  routes: path.join(ROOT, "apps/backend/src/dispatch/loads.routes.ts"),
  archDesign: path.join(ROOT, "docs/specs/IH35_ARCHITECTURAL_DESIGN.md"),
};

function read(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

function fail(msg) {
  console.error(`verify:dispatch-settings-tab FAIL: ${msg}`);
  process.exit(1);
}

function main() {
  const page = read(paths.page);
  const pageTest = read(paths.pageTest);
  const dispatchApi = read(paths.dispatchApi);
  const manifest = read(paths.manifest);
  const sidebar = read(paths.sidebar);
  const routes = read(paths.routes);
  const archDesign = read(paths.archDesign);
  const failures = [];

  if (!page.includes("dispatch-settings-page")) failures.push("DispatchSettingsPage must expose test id");
  if (!page.includes("dispatch-settings-default-view")) failures.push("DispatchSettingsPage must expose default view panel");
  if (!page.includes("getDispatchPreferences")) failures.push("DispatchSettingsPage must load preferences via API");
  if (!page.includes("updateDispatchPreferences")) failures.push("DispatchSettingsPage must save preferences via API");
  if (!page.includes("dispatch-settings-auto-routing")) failures.push("DispatchSettingsPage must expose auto-routing section");
  if (!page.includes("dispatch-settings-alert-thresholds")) failures.push("DispatchSettingsPage must expose alert thresholds section");
  if ((pageTest.match(/\bit\(/g) ?? []).length < 3) failures.push("DispatchSettingsPage tests must cover at least 3 cases");

  if (!dispatchApi.includes("getDispatchPreferences")) failures.push("dispatch API must export getDispatchPreferences");
  if (!dispatchApi.includes("updateDispatchPreferences")) failures.push("dispatch API must export updateDispatchPreferences");
  if (!routes.includes('app.get("/api/v1/dispatch/preferences"')) failures.push("backend must expose GET dispatch preferences");
  if (!routes.includes('app.patch("/api/v1/dispatch/preferences"')) failures.push("backend must expose PATCH dispatch preferences");
  if (!manifest.includes('path="/dispatch/settings"')) failures.push("manifest must route /dispatch/settings");
  if (!manifest.includes("DispatchSettingsPage")) failures.push("manifest must import DispatchSettingsPage");

  const dispatchFlyout = sidebar.split('case "dispatch"')[1]?.split("case ")[0] ?? "";
  if (!dispatchFlyout.includes("/dispatch/settings")) failures.push("sidebar flyout must link dispatch settings");

  if (!archDesign.includes("verify:dispatch-settings-tab")) {
    failures.push("ARCHITECTURAL_DESIGN must reference verify:dispatch-settings-tab");
  }

  if (failures.length) {
    for (const f of failures) console.error(` - ${f}`);
    fail(failures.join("; "));
  }

  console.log("verify:dispatch-settings-tab PASS");
}

main();
