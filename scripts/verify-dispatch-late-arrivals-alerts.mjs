#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["driver","reverse_link"],"leaves":["queues.late"],"task":"DRV-F6201-LATE-ARRIVAL-SHARED-DRIVER-LABEL","vertical":"column-wave"} */
/** @matrix-built {"modules":["reports"],"cols":["connectivity"],"leaves":["report.late_arrival"],"task":"DSP-F7071-LATE-ARRIVAL-ANALYTICS-COMPLETE-RANGE","vertical":"class-sweep"} */
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
  analyticsService: path.join(ROOT, "apps/backend/src/dispatch/analytics/late-arrival.service.ts"),
  bookingGapService: path.join(ROOT, "apps/backend/src/dispatch/analytics/booking-gap.service.ts"),
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
const analyticsSharedDriverScope = /driver_company_authorizations late_arrival_analytics_dca[\s\S]{0,360}late_arrival_analytics_dca\.driver_id = d\.id[\s\S]{0,180}late_arrival_analytics_dca\.company_id = sa\.operating_company_id[\s\S]{0,180}late_arrival_analytics_dca\.is_authorized = true[\s\S]{0,180}late_arrival_analytics_dca\.deactivated_at IS NULL/;
const completedStopScope = /JOIN mdata\.load_stops ls ON ls\.id = sa\.stop_id[\s\S]{0,100}ls\.soft_deleted_at IS NULL/;
const laneStopScope = /p\.stop_type = 'pickup'[\s\S]{0,100}p\.soft_deleted_at IS NULL[\s\S]{0,100}del\.stop_type = 'delivery'[\s\S]{0,100}del\.soft_deleted_at IS NULL/;
const bookingGapStopScope = /JOIN mdata\.load_stops ls[\s\S]{0,100}ls\.load_id = l\.id[\s\S]{0,100}ls\.stop_type = 'delivery'[\s\S]{0,100}ls\.soft_deleted_at IS NULL/;
const queueStopScope = /FROM mdata\.load_stops[\s\S]{0,100}load_id = l\.id[\s\S]{0,100}soft_deleted_at IS NULL[\s\S]{0,100}scheduled_arrival_at IS NOT NULL/;

function completeRangeFailures(source) {
  const aggregateReaders = source.match(/ORDER BY late_count DESC, entity_label ASC[\s\S]{0,80}/g) ?? [];
  return [
    aggregateReaders.length !== 2
      ? "late-arrival analytics must retain both deterministic aggregate readers"
      : null,
    aggregateReaders.some((reader) => /\bLIMIT\s+\d+/i.test(reader))
      ? "late-arrival analytics silently cap grouped report rows"
      : null,
    !/SELECT id::text FROM org\.companies WHERE is_active = true ORDER BY id/.test(source)
      ? "late-arrival worker must scan every active company deterministically"
      : null,
    /org\.companies WHERE is_active = true[^`]*\bLIMIT\s+\d+/i.test(source)
      ? "late-arrival worker silently caps active companies"
      : null,
  ].filter(Boolean);
}

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
  const analyticsService = read(paths.analyticsService);
  const bookingGapService = read(paths.bookingGapService);
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
  if (!analyticsSharedDriverScope.test(analyticsService)) {
    failures.push("late-arrival analytics driver label must admit active canonical selected-company authorization");
  }
  if (!completedStopScope.test(analyticsService)) failures.push("late-arrival facts must exclude retired stops");
  if (!laneStopScope.test(analyticsService)) failures.push("late-arrival lane endpoints must exclude retired stops");
  if (!bookingGapStopScope.test(bookingGapService)) failures.push("booking-gap deliveries must exclude retired stops");
  if (!queueStopScope.test(service)) failures.push("late-arrivals queue must exclude retired upcoming stops");
  failures.push(...completeRangeFailures(analyticsService));
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
    const analyticsMutations = [
      analyticsService.replace("late_arrival_analytics_dca.is_authorized = true", "late_arrival_analytics_dca.is_authorized = false"),
      analyticsService.replace("late_arrival_analytics_dca.deactivated_at IS NULL", "late_arrival_analytics_dca.deactivated_at IS NOT NULL"),
    ];
    for (const [index, mutated] of analyticsMutations.entries()) {
      if (mutated === analyticsService || analyticsSharedDriverScope.test(mutated)) fail(`analytics shared-driver mutation ${index + 1} escaped`);
    }
    const rangeMutations = [
      analyticsService.replace("ORDER BY late_count DESC, entity_label ASC", "ORDER BY late_count DESC, entity_label ASC LIMIT 500"),
      analyticsService.replace("WHERE is_active = true ORDER BY id", "WHERE is_active = true LIMIT 200"),
    ];
    for (const [index, mutated] of rangeMutations.entries()) {
      if (mutated === analyticsService || completeRangeFailures(mutated).length === 0) fail(`complete-range mutation ${index + 1} escaped`);
    }
    const activeStopMutations = [
      [analyticsService.replace("                            AND ls.soft_deleted_at IS NULL", ""), completedStopScope, "completed stop"],
      [analyticsService.replace("        AND p.soft_deleted_at IS NULL", ""), laneStopScope, "pickup lane stop"],
      [analyticsService.replace("        AND del.soft_deleted_at IS NULL", ""), laneStopScope, "delivery lane stop"],
      [bookingGapService.replace("         AND ls.soft_deleted_at IS NULL", ""), bookingGapStopScope, "booking-gap stop"],
      [service.replace("            AND soft_deleted_at IS NULL", ""), queueStopScope, "queue upcoming stop"],
    ];
    for (const [mutated, pattern, label] of activeStopMutations) {
      if (pattern.test(mutated)) fail(`${label} mutation escaped`);
    }
    console.log("verify:dispatch-late-arrivals-alerts SELFTEST PASS — 12/12 shared-driver/complete-range/active-stop mutations red");
    return;
  }

  console.log("verify:dispatch-late-arrivals-alerts PASS");
}

main();
