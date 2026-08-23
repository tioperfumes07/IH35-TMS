#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["driver","reverse_link"],"leaves":["queues.late"],"task":"DRV-F6201-LATE-ARRIVAL-SHARED-DRIVER-LABEL","vertical":"column-wave"} */
/**
 * Block B21-D6: Dispatch alerts late-arrivals endpoint + UI card drill-down.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const paths = {
  routes: path.join(ROOT, "apps/backend/src/dispatch/alerts.routes.ts"),
  service: path.join(ROOT, "apps/backend/src/dispatch/late-arrivals.service.ts"),
  index: path.join(ROOT, "apps/backend/src/index.ts"),
  alertsPage: path.join(ROOT, "apps/frontend/src/pages/dispatch/DispatchAlertsPage.tsx"),
  drilldown: path.join(ROOT, "apps/frontend/src/pages/dispatch/LateArrivalsPage.tsx"),
  dispatchApi: path.join(ROOT, "apps/frontend/src/api/dispatch.ts"),
  manifest: path.join(ROOT, "apps/frontend/src/routes/manifest.tsx"),
  archDesign: path.join(ROOT, "docs/specs/IH35_ARCHITECTURAL_DESIGN.md"),
  dispatchPage: path.join(ROOT, "apps/frontend/src/pages/Dispatch.tsx"),
  loadsRoute: path.join(ROOT, "apps/backend/src/mdata/loads.routes.ts"),
};

const sharedDriverScope = /FROM mdata\.driver_company_authorizations late_arrivals_list_dca[\s\S]{0,180}late_arrivals_list_dca\.driver_id = d\.id[\s\S]{0,140}late_arrivals_list_dca\.company_id = l\.operating_company_id[\s\S]{0,140}late_arrivals_list_dca\.is_authorized = true[\s\S]{0,140}late_arrivals_list_dca\.deactivated_at IS NULL/;

function read(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

function fail(msg) {
  console.error(`verify:dispatch-late-arrivals-alerts FAIL: ${msg}`);
  process.exit(1);
}

function main() {
  const routes = read(paths.routes);
  const service = read(paths.service);
  const index = read(paths.index);
  const alertsPage = read(paths.alertsPage);
  const drilldown = read(paths.drilldown);
  const dispatchApi = read(paths.dispatchApi);
  const manifest = read(paths.manifest);
  const archDesign = read(paths.archDesign);
  const dispatchPage = read(paths.dispatchPage);
  const loadsRoute = read(paths.loadsRoute);
  const failures = [];

  if (!routes.includes("/api/v1/dispatch/alerts/late-arrivals")) {
    failures.push("alerts.routes must expose late-arrivals endpoint");
  }
  if (!service.includes("DISPATCH_LATE_ARRIVAL_GRACE_MINUTES")) {
    failures.push("late-arrivals.service must read grace threshold env");
  }
  if (!sharedDriverScope.test(service)) {
    failures.push("late-arrivals driver label must admit active canonical selected-company authorization");
  }
  if (!index.includes("registerDispatchAlertsRoutes")) {
    failures.push("backend index must register dispatch alerts routes");
  }
  if (!alertsPage.includes("listLateArrivalDispatchLoads")) {
    failures.push("DispatchAlertsPage must fetch late arrivals count");
  }
  if (alertsPage.includes("lateCount: number | null = null")) {
    failures.push("DispatchAlertsPage must not hardcode late count null");
  }
  if (!drilldown.includes("dispatch-late-arrivals-page")) {
    failures.push("LateArrivalsPage must expose drill-down test id");
  }
  if (!dispatchApi.includes("listLateArrivalDispatchLoads")) {
    failures.push("dispatch API must export listLateArrivalDispatchLoads");
  }
  if (!manifest.includes('path="/dispatch/alerts/late-arrivals"')) {
    failures.push("manifest must route late-arrivals drill-down");
  }
  if (!archDesign.includes("verify:dispatch-late-arrivals-alerts")) {
    failures.push("ARCHITECTURAL_DESIGN must reference verify:dispatch-late-arrivals-alerts");
  }
  if (!dispatchPage.includes("include_live_eta: true")) failures.push("Dispatch board must request batched live ETA");
  if (!loadsRoute.includes("include_live_eta") || !loadsRoute.includes("enrichLoadsLiveEta")) {
    failures.push("load list must return batched live ETA enrichment");
  }

  if (failures.length) {
    for (const f of failures) console.error(` - ${f}`);
    fail(failures.join("; "));
  }

  if (process.argv.includes("--selftest")) {
    const mutations = [
      service.replace("late_arrivals_list_dca.is_authorized = true", "late_arrivals_list_dca.is_authorized = false"),
      service.replace("late_arrivals_list_dca.deactivated_at IS NULL", "late_arrivals_list_dca.deactivated_at IS NOT NULL"),
      service.replace("late_arrivals_list_dca.company_id = l.operating_company_id", "late_arrivals_list_dca.company_id = d.operating_company_id"),
    ];
    for (const [index, mutated] of mutations.entries()) {
      if (mutated === service || sharedDriverScope.test(mutated)) fail(`shared-driver mutation ${index + 1} escaped`);
    }
    console.log("verify:dispatch-late-arrivals-alerts SELFTEST PASS — 3/3 shared-driver mutations red");
    return;
  }

  console.log("verify:dispatch-late-arrivals-alerts PASS");
}

main();
