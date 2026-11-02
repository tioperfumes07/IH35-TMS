#!/usr/bin/env node
/**
 * BANK leftover refuse + fill-not-shell — dispatch empty-company surfaces use BoardSection
 * (not bare bordered div) and must not reintroduce slate chrome.
 */
import { readFileSync } from "node:fs";

const TARGETS = [
  ["apps/frontend/src/pages/dispatch/LoadsWithoutDriverBillPage.tsx", "loads-without-driver-bill-need-company"],
  ["apps/frontend/src/pages/dispatch/LoadsWithoutTourPage.tsx", "loads-without-tour-need-company"],
  ["apps/frontend/src/pages/dispatch/AtRiskQueuePage.tsx", "at-risk-need-company"],
  ["apps/frontend/src/pages/dispatch/AssignmentHistoryPage.tsx", "assignment-history-need-company"],
  ["apps/frontend/src/pages/dispatch/NeedsDeliveryAuthorizationPage.tsx", "needs-delivery-auth-need-company"],
  ["apps/frontend/src/pages/dispatch/AwaitingBolInvoicePage.tsx", "awaiting-bol-need-company"],
  ["apps/frontend/src/pages/dispatch/DetentionBoardPage.tsx", "detention-need-company"],
  ["apps/frontend/src/pages/dispatch/LateArrivalsPage.tsx", "late-arrivals-need-company"],
  ["apps/frontend/src/pages/dispatch/OcrQueuePage.tsx", "ocr-queue-need-company"],
  ["apps/frontend/src/pages/dispatch/InTransitIssuesPage.tsx", "in-transit-issues-need-company"],
  ["apps/frontend/src/pages/dispatch/FactoringQueuePage.tsx", "factoring-queue-need-company"],
  ["apps/frontend/src/pages/dispatch/DispatchAlertsPage.tsx", "dispatch-alerts-need-company"],
  ["apps/frontend/src/pages/dispatch/OwnerOverrideLogPage.tsx", "owner-override-log-need-company"],
  ["apps/frontend/src/pages/dispatch/LoadBankingLinkagePage.tsx", "load-banking-linkage-need-company"],
  ["apps/frontend/src/pages/dispatch/RoundTrips.tsx", "round-trips-need-company"],
  ["apps/frontend/src/pages/dispatch/DispatchOverview.tsx", "dispatch-overview-need-company"],
  ["apps/frontend/src/pages/dispatch/cargo-sensors/CargoSensorTimeline.tsx", "cargo-sensor-timeline-need-company"],
  ["apps/frontend/src/pages/dispatch/DispatchSettingsPage.tsx", "dispatch-settings-need-company"],
  ["apps/frontend/src/pages/dispatch/MapView.tsx", "dispatch-map-need-company"],
  ["apps/frontend/src/pages/dispatch/PlannerCalendarPage.tsx", "dispatch-planner-need-company"],
  ["apps/frontend/src/pages/dispatch/TripPairingBoardPage.tsx", "dispatch-trip-pairing-need-company"],
  ["apps/frontend/src/pages/dispatch/planners/DriverPlanner.tsx", "dispatch-driver-planner-need-company"],
  ["apps/frontend/src/pages/dispatch/planners/LoadsPlanner.tsx", "dispatch-loads-planner-need-company"],
  ["apps/frontend/src/pages/dispatch/planners/TruckPlanner.tsx", "dispatch-truck-planner-need-company"],
  ["apps/frontend/src/pages/dispatch/planners/UnifiedTimelinePlanner.tsx", "dispatch-timeline-need-company"],
  ["apps/frontend/src/pages/dispatch/DriverBillRemintScreen.tsx", "driver-bill-remint-need-company"],
];
const LABEL = "verify-91190-dispatch-empty-company-slate-leftover-chrome";

function leftoverHits(src) {
  const hits = [];
  if (
    src.includes("text-slate-") ||
    src.includes("border-slate-") ||
    src.includes("border-l-slate-") ||
    src.includes("border-t-slate-") ||
    src.includes("bg-slate-") ||
    src.includes("hover:bg-slate-") ||
    src.includes("hover:text-slate-") ||
    src.includes("focus:bg-slate-") ||
    src.includes("divide-slate-") ||
    src.includes("sm:divide-slate-") ||
    src.includes("ring-slate-") ||
    src.includes("decoration-slate-") ||
    src.includes("focus:ring-slate-") ||
    src.includes("focus-visible:ring-slate-") ||
    src.includes("focus:border-slate-") ||
    src.includes("outline-slate-") ||
    src.includes("focus-visible:outline-slate-") ||
    src.includes("accent-slate-") ||
    src.includes("disabled:bg-slate-") ||
    src.includes("hover:border-slate-") ||
    src.includes("caret-slate-")
  ) {
    hits.push("leftover slate class");
  }
  return hits;
}

function boardHits(src, testId) {
  const hits = [];
  if (!/from ["'](?:\.\.\/)+components\/v3\/BoardSection["']/.test(src)) {
    hits.push("must import BoardSection");
  }
  if (!src.includes(`testId="${testId}"`)) {
    hits.push(`need-company BoardSection testId=${testId} required`);
  }
  return hits;
}

function audit(sources) {
  const fails = [];
  for (const [path, src, testId] of sources) {
    for (const e of leftoverHits(src)) fails.push(`${path}: ${e}`);
    for (const e of boardHits(src, testId)) fails.push(`${path}: ${e}`);
  }
  return fails;
}

function main() {
  const sources = TARGETS.map(([path, testId]) => [path, readFileSync(path, "utf8"), testId]);
  if (process.argv.includes("--selftest")) {
    const [path0, src0, testId0] = sources[0];
    const slatePlant = `${src0}\n<span className="text-slate-700 border-slate-200 bg-slate-50">plant</span>\n`;
    if (
      !audit([[path0, slatePlant, testId0], ...sources.slice(1)]).some(
        (e) => e.includes(path0) && e.includes("leftover slate class"),
      )
    ) {
      console.error(`${LABEL} SELFTEST FAIL leftover plant escaped`);
      process.exit(1);
    }
    const boardPlant = src0
      .replace(/from ["']\.\.\/\.\.\/components\/v3\/BoardSection["']/g, 'from "../../components/v3/Stripped"')
      .replace(new RegExp(`testId="${testId0}"`, "g"), 'testId="x"');
    const boardFails = audit([[path0, boardPlant, testId0], ...sources.slice(1)]);
    if (
      !boardFails.some((e) => e.includes(path0) && e.includes("BoardSection")) ||
      !boardFails.some((e) => e.includes(path0) && e.includes(testId0))
    ) {
      console.error(`${LABEL} SELFTEST FAIL BoardSection plant escaped: ${boardFails.join("; ")}`);
      process.exit(1);
    }
    console.log(`${LABEL}: SELFTEST PASS leftover + BoardSection plants`);
    process.exit(0);
  }
  const fails = audit(sources);
  if (fails.length) {
    console.error(`${LABEL}: FAIL`);
    for (const e of fails) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS leftover slate refuse + BoardSection need-company (${TARGETS.length} files)`);
}
main();
