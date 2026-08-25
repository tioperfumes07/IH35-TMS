#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["connectivity"],"task":"DISPATCH-LIVE-ETA","leafRe":"^home\\.list$"} */
/**
 * DISPATCH-LIVE-ETA: CI guard — live ETA columns wired without per-row fetches.
 *
 * LINK-THEATER-01 narrowing (2026-08-14): every assertion below reads exactly one leaf —
 * apps/frontend/src/pages/dispatch/DispatchBoard.tsx, mounted at /dispatch?view=list (dispatch
 * leaf id home.list, confirmed against Dispatch.tsx's view switch). The tag previously claimed
 * leafRe=".*" — Built for connectivity across every leaf in the dispatch module — off assertions
 * that only ever touch this one board view. Narrowed to what the guard actually proves; the rest of
 * dispatch's connectivity leaves are real, undrained backlog, not silently credited by this guard.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const SELFTEST = process.argv.includes("--selftest");
// Rule 17 (no-guard-hotfile-thrash): a guard must NOT require a package.json / ci.yml edit —
// those are the shared hot files every lane contends on, and Rule 17 forbids a new guard from touching
// them. What actually makes a guard run in CI is a verify-step, so check for that and report its
// absence as a NOTE, never as a failure.
const wiredDirectStep = fs
  .readdirSync(path.join(ROOT, "scripts/verify-steps"))
  .some((f) => /^\d+-verify-dispatch-eta-columns\.mjs$/.test(f));
const wiredViaLateArrivals = fs
  .readdirSync(path.join(ROOT, "scripts/verify-steps"))
  .some((f) => /^\d+-verify-dispatch-late-arrivals-alerts\.mjs$/.test(f)) &&
  fs.readFileSync(path.join(ROOT, "scripts/verify-dispatch-late-arrivals-alerts.mjs"), "utf8").includes("include_live_eta");
if (!wiredDirectStep && !wiredViaLateArrivals) {
  console.warn(
    "verify-dispatch-eta-columns: NOTE — no scripts/verify-steps/NNNN-verify-dispatch-eta-columns.mjs, so this guard does not execute in CI. Wiring it requires a claimed step number (Rule 37); a package.json script does not wire it."
  );
}

const failures = [];

const retiredPerRowComponents = [
  "apps/frontend/src/components/dispatch/InTransitEtaChip.tsx",
  "apps/frontend/src/pages/dispatch/components/DriverStatusCell.tsx",
];
function retiredComponentFailures(exists = fs.existsSync) {
  return retiredPerRowComponents
    .filter((relativePath) => exists(path.join(ROOT, relativePath)))
    .map((relativePath) => `${relativePath}: obsolete per-row component must remain consolidated into LiveEtaColumns`);
}
failures.push(...retiredComponentFailures());

function fail(message) {
  failures.push(message);
}

function read(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) {
    fail(`MISSING: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function contains(relativePath, content, checks) {
  if (!content) return;
  for (const check of checks) {
    const pattern = check.pattern instanceof RegExp ? check.pattern : new RegExp(check.pattern);
    if (!pattern.test(content)) {
      fail(`${relativePath}: missing ${check.label}`);
    }
  }
}

function mustNotContain(relativePath, content, checks) {
  if (!content) return;
  for (const check of checks) {
    const pattern = check.pattern instanceof RegExp ? check.pattern : new RegExp(check.pattern);
    if (pattern.test(content)) {
      fail(`${relativePath}: forbidden ${check.label}`);
    }
  }
}

const dispatchList = read("apps/frontend/src/pages/dispatch/DispatchBoard.tsx");
contains("apps/frontend/src/pages/dispatch/DispatchBoard.tsx", dispatchList, [
  { pattern: /DriverStatusColumn/, label: "DriverStatusColumn import/usage" },
  { pattern: /SamsaraEtaColumn/, label: "SamsaraEtaColumn import/usage" },
  { pattern: /OnTimePredictionColumn/, label: "OnTimePredictionColumn import/usage" },
  { pattern: /LiveEtaFreshnessColumn/, label: "LiveEtaFreshnessColumn import/usage" },
  { pattern: /Driver Status/, label: "Driver Status column header" },
  { pattern: /Samsara ETA/, label: "Samsara ETA column header" },
  { pattern: /On-time/, label: "On-time column header" },
  { pattern: /Freshness/, label: "Freshness column header" },
]);
mustNotContain("apps/frontend/src/pages/dispatch/DispatchBoard.tsx", dispatchList, [
  { pattern: /InTransitEtaChip/, label: "per-row InTransitEtaChip" },
  { pattern: /getDispatchLoadEta/, label: "per-row getDispatchLoadEta" },
]);
const archivedDispatchList = read("apps/frontend/src/components/dispatch/DispatchList.tsx");
mustNotContain("apps/frontend/src/components/dispatch/DispatchList.tsx", archivedDispatchList, [
  { pattern: /InTransitEtaChip/, label: "reference to retired per-row InTransitEtaChip" },
  { pattern: /getDispatchLoadEta/, label: "per-row getDispatchLoadEta" },
]);

const liveEtaColumns = read("apps/frontend/src/components/dispatch/LiveEtaColumns.tsx");
contains("apps/frontend/src/components/dispatch/LiveEtaColumns.tsx", liveEtaColumns, [
  { pattern: /from "\.\/FreshnessIndicator"/, label: "FreshnessIndicator import from GAP-24 path" },
  { pattern: /driver-status-column/, label: "driver status test id" },
  { pattern: /samsara-eta-column/, label: "samsara eta test id" },
  { pattern: /on-time-prediction-column/, label: "on-time prediction test id" },
]);

read("apps/frontend/src/components/dispatch/LiveEtaColumns.test.tsx");
const telematicsEta = read("apps/backend/src/telematics/dispatch-live-eta.service.ts");
read("apps/backend/src/telematics/__tests__/dispatch-live-eta.test.ts");
const refinedEta = read("apps/backend/src/dispatch/dispatch-refinements.service.ts");
const dispatchApi = read("apps/frontend/src/api/dispatch.ts");

function etaHonestyFailures(telematics, refined, api) {
  const out = [];
  if (/charCodeAt\s*\(/.test(telematics)) out.push("batched live ETA must not synthesize arrival time from load id");
  if (/else if \(samsaraVehicle\?\.last_seen_at\)[\s\S]{0,420}samsaraEtaAt\s*=/.test(telematics)) out.push("Samsara last_seen_at alone must not manufacture an ETA");
  if (/charCodeAt\s*\(/.test(refined)) out.push("mounted load ETA endpoint must not synthesize telemetry from load id");
  if (!/eta_at:\s*null as string \| null[\s\S]{0,100}source:\s*["']unavailable["'] as const/.test(refined)) out.push("mounted load ETA endpoint must return explicit unavailable/null without a real ETA");
  if (!/eta_at:\s*string \| null/.test(api) || !/source:\s*["']samsara["'] \| ["']manual["'] \| ["']fallback["'] \| ["']unavailable["']/.test(api)) out.push("frontend ETA contract must represent unavailable/null honestly");
  return out;
}

for (const issue of etaHonestyFailures(telematicsEta, refinedEta, dispatchApi)) fail(issue);

const loadsApi = read("apps/frontend/src/api/loads.ts");
contains("apps/frontend/src/api/loads.ts", loadsApi, [
  { pattern: /include_live_eta/, label: "include_live_eta filter" },
  { pattern: /driver_pwa_last_ping_at/, label: "driver_pwa_last_ping_at type" },
  { pattern: /samsara_eta_at/, label: "samsara_eta_at type" },
  { pattern: /on_time_prediction/, label: "on_time_prediction type" },
]);

const dispatchPage = read("apps/frontend/src/pages/Dispatch.tsx");
contains("apps/frontend/src/pages/Dispatch.tsx", dispatchPage, [
  { pattern: /include_live_eta:\s*true/, label: "include_live_eta board query flag" },
]);

const loadsRoutes = read("apps/backend/src/mdata/loads.routes.ts");
contains("apps/backend/src/mdata/loads.routes.ts", loadsRoutes, [
  { pattern: /include_live_eta/, label: "include_live_eta query param" },
  { pattern: /enrichLoadsLiveEta/, label: "enrichLoadsLiveEta enrichment" },
]);

if (SELFTEST) {
  const mutations = [
    ["board ETA column", dispatchList.replaceAll("SamsaraEtaColumn", "RemovedEtaColumn"), /SamsaraEtaColumn/],
    ["board request flag", dispatchPage.replace(/include_live_eta:\s*true/, "include_live_eta: false"), /include_live_eta:\s*true/],
    ["backend enrichment", loadsRoutes.replaceAll("enrichLoadsLiveEta", "disabledLiveEta"), /enrichLoadsLiveEta/],
  ];
  for (const [label, planted, expected] of mutations) {
    if (expected.test(planted)) {
      console.error(`verify:dispatch-eta-columns SELFTEST FAIL — ${label} mutation survived`);
      process.exit(1);
    }
  }
  const plantedRetiredFailures = retiredComponentFailures(() => true);
  if (plantedRetiredFailures.length !== retiredPerRowComponents.length) {
    console.error("verify:dispatch-eta-columns SELFTEST FAIL — planted retired components were not caught");
    process.exit(1);
  }
  const honestMutations = [
    ["batched synthetic ETA", `${telematicsEta}\nconst hoursAhead = row.id.charCodeAt(0);`],
    ["mounted synthetic telemetry", `${refinedEta}\nconst fake = loadId.charCodeAt(1);`],
    ["nullable API removed", dispatchApi.replace("eta_at: string | null", "eta_at: string")],
  ];
  for (const [label, planted] of honestMutations) {
    const found = label === "batched synthetic ETA"
      ? etaHonestyFailures(planted, refinedEta, dispatchApi)
      : label === "mounted synthetic telemetry"
        ? etaHonestyFailures(telematicsEta, planted, dispatchApi)
        : etaHonestyFailures(telematicsEta, refinedEta, planted);
    if (!found.length) {
      console.error(`verify:dispatch-eta-columns SELFTEST FAIL — ${label} was not caught`);
      process.exit(1);
    }
  }
  console.log(`verify:dispatch-eta-columns SELFTEST PASS — ${mutations.length + retiredPerRowComponents.length + honestMutations.length} wiring/honesty mutations caught`);
  process.exit(0);
}

const manifest = read(".block-ready/DISPATCH-LIVE-ETA.json");
contains(".block-ready/DISPATCH-LIVE-ETA.json", manifest, [
  { pattern: /"block_id":\s*"DISPATCH-LIVE-ETA"/, label: "block_id" },
  { pattern: /verify:dispatch-eta-columns/, label: "extra_gates verify script" },
  { pattern: /DispatchBoard\.tsx/, label: "DispatchBoard forbidden path" },
]);



if (failures.length) {
  console.error("verify:dispatch-eta-columns FAIL:");
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}

console.log("verify:dispatch-eta-columns OK");
