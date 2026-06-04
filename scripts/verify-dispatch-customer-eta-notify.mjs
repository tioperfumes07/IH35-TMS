#!/usr/bin/env node
/**
 * Block B21-D9: Customer ETA notify — milestone SMS/email dispatch + delivery log.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const paths = {
  migration: path.join(ROOT, "db/migrations/0355_dispatch_notify_log.sql"),
  page: path.join(ROOT, "apps/frontend/src/pages/dispatch/NotifyPreferencesPage.tsx"),
  pageTest: path.join(ROOT, "apps/frontend/src/pages/dispatch/__tests__/NotifyPreferencesPage.test.tsx"),
  routes: path.join(ROOT, "apps/backend/src/dispatch/customer-notify.routes.ts"),
  service: path.join(ROOT, "apps/backend/src/dispatch/customer-notify.service.ts"),
  routeTest: path.join(ROOT, "apps/backend/src/dispatch/__tests__/customer-notify.routes.test.ts"),
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
  console.error(`verify:dispatch-customer-eta-notify FAIL: ${msg}`);
  process.exit(1);
}

function main() {
  const migration = read(paths.migration);
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

  if (!migration.includes("dispatch.notify_log")) failures.push("migration 0355 must create notify_log");
  if (!migration.includes("dispatch.customer_notify_preferences")) failures.push("migration 0355 must create customer_notify_preferences");
  if (!page.includes("dispatch-notify-preferences-page")) failures.push("NotifyPreferencesPage must expose test id");
  if (!page.includes("notify-preferences-panel")) failures.push("NotifyPreferencesPage must expose preferences panel");
  if (!page.includes("Delivery log")) failures.push("NotifyPreferencesPage must show delivery log");
  if ((pageTest.match(/\bit\(/g) ?? []).length < 2) failures.push("NotifyPreferencesPage tests must cover at least 2 cases");
  if ((routeTest.match(/\bit\(/g) ?? []).length < 4) failures.push("customer-notify routes tests must cover at least 4 cases");

  if (!routes.includes("/api/v1/dispatch/customer-notify/log")) failures.push("routes must expose notify log endpoint");
  if (!routes.includes("/api/v1/dispatch/customer-notify/preferences/:customerId")) failures.push("routes must expose preferences endpoint");
  if (!routes.includes("/api/v1/dispatch/customer-notify/sync")) failures.push("routes must expose sync endpoint");
  if (!service.includes("processStopArrivalNotifications")) failures.push("service must subscribe to stop arrivals");
  if (!service.includes("processEtaUpdateNotifications")) failures.push("service must subscribe to ETA updates");
  if (!service.includes("sendEmail")) failures.push("service must dispatch email");
  if (!service.includes("sendSms")) failures.push("service must dispatch SMS");
  if (!service.includes("dispatch.notify_log")) failures.push("service must log delivery confirmations");
  if (!index.includes("registerDispatchCustomerNotifyRoutes")) failures.push("backend index must register customer notify routes");

  if (!dispatchApi.includes("getCustomerNotifyLog")) failures.push("dispatch API must export getCustomerNotifyLog");
  if (!dispatchApi.includes("syncCustomerNotify")) failures.push("dispatch API must export syncCustomerNotify");
  if (!manifest.includes('path="/dispatch/notify-preferences"')) failures.push("manifest must route /dispatch/notify-preferences");

  const dispatchFlyout = sidebar.split('case "dispatch"')[1]?.split("case ")[0] ?? "";
  if (!dispatchFlyout.includes("/dispatch/notify-preferences")) failures.push("sidebar flyout must link notify preferences");

  if (!archDesign.includes("verify:dispatch-customer-eta-notify")) {
    failures.push("ARCHITECTURAL_DESIGN must reference verify:dispatch-customer-eta-notify");
  }

  if (failures.length) {
    for (const f of failures) console.error(` - ${f}`);
    fail(failures.join("; "));
  }

  console.log("verify:dispatch-customer-eta-notify PASS");
}

main();
