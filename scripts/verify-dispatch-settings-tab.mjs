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

export function checkSettingsReadBeforeWrite(page) {
  const failures = [];
  const disabledContracts = page.match(/disabled=\{prefsQuery\.isLoading \|\| prefsQuery\.isError \|\| saveViewM\.isPending\}/g) ?? [];
  if (disabledContracts.length !== 2) failures.push("both saved-view choices must fail closed while the preference read is failed");
  if (!page.includes("Retry before changing it so an unknown saved preference")) failures.push("read failure must explain that Retry is required before write");
  if (page.includes("Choosing an option below will still save")) failures.push("read failure must not invite a blind preference overwrite");
  return failures;
}

export function checkSettingsWritePersistence(routes) {
  const failures = [];
  const patch = routes.slice(routes.indexOf('app.patch("/api/v1/dispatch/preferences"'), routes.indexOf('app.get("/api/v1/dispatch/loads"'));
  if (!/INSERT INTO identity\.user_preferences[\s\S]*RETURNING dispatch_default_view/.test(patch)) failures.push("PATCH must write and return the canonical preference");
  if (!/const preference = res\.rows\[0\];[\s\S]*if \(!preference\)[\s\S]*code: "E_DISPATCH_PREFERENCE_WRITE_FAILED"[\s\S]*return preference;/.test(patch)) failures.push("PATCH must fail loud when the preference upsert returns no identity");
  return failures;
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
  failures.push(...checkSettingsReadBeforeWrite(page));
  failures.push(...checkSettingsWritePersistence(routes));
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

if (process.argv.includes("--selftest")) {
  const fixed = read(paths.page);
  const buggy = fixed
    .replaceAll("prefsQuery.isLoading || prefsQuery.isError || saveViewM.isPending", "prefsQuery.isLoading || saveViewM.isPending")
    .replace("Retry before changing it so an unknown saved preference", "Choosing an option below will still save");
  const planted = checkSettingsReadBeforeWrite(buggy);
  const current = checkSettingsReadBeforeWrite(fixed);
  const routes = read(paths.routes);
  const brokenRoutes = routes.replace('code: "E_DISPATCH_PREFERENCE_WRITE_FAILED"', 'code: "REMOVED"');
  const plantedWrite = checkSettingsWritePersistence(brokenRoutes);
  const currentWrite = checkSettingsWritePersistence(routes);
  if (planted.length >= 3 && current.length === 0 && plantedWrite.length === 1 && currentWrite.length === 0) {
    console.log("verify:dispatch-settings-tab selftest PASS — planted blind-write regression rejected");
    process.exit(0);
  }
  fail(`selftest failed: planted=${planted.length}, current=${current.join("; ") || "none"}`);
}

main();
