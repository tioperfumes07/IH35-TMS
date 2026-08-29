#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SELFTEST = process.argv.includes("--selftest");
// Rule 17 (no-guard-hotfile-thrash): a guard must NOT require a package.json / ci.yml edit —
// those are the shared hot files every lane contends on, and Rule 17 forbids a new guard from touching
// them. What actually makes a guard run in CI is a verify-step, so check for that and report its
// absence as a NOTE, never as a failure.
const wiredDirectStep = fs
  .readdirSync(path.join(ROOT, "scripts/verify-steps"))
  .some((f) => /^\d+-verify-driver-pwa-dispatch-view\.mjs$/.test(f));
const wiredViaPwaLiveData = fs
  .readdirSync(path.join(ROOT, "scripts/verify-steps"))
  .some((f) => /^\d+-verify-drivers-pwa-live-data\.mjs$/.test(f)) &&
  fs.readFileSync(path.join(ROOT, "scripts/verify-drivers-pwa-live-data.mjs"), "utf8").includes('path="/dispatch/:load_uuid"');
if (!wiredDirectStep && !wiredViaPwaLiveData) {
  console.warn(
    "verify-driver-pwa-dispatch-view: NOTE — no scripts/verify-steps/NNNN-verify-driver-pwa-dispatch-view.mjs, so this guard does not execute in CI. Wiring it requires a claimed step number (Rule 37); a package.json script does not wire it."
  );
}

const failures = [];

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

const routes = read("apps/backend/src/dispatch/driver-pwa/dispatch-view.routes.ts");
contains("apps/backend/src/dispatch/driver-pwa/dispatch-view.routes.ts", routes, [
  { pattern: /registerDispatchViewRoutes/, label: "route register export" },
  { pattern: /\/api\/dispatch\/driver-pwa\/load\/:uuid\/dispatch-view/, label: "dispatch-view GET route" },
  { pattern: /\/stops\/:stop_uuid\/arrival/, label: "arrival POST route" },
  { pattern: /\/stops\/:stop_uuid\/departure/, label: "departure POST route" },
  { pattern: /\/stops\/:stop_uuid\/document/, label: "document POST route" },
  { pattern: /assigned_primary_driver_id/, label: "driver RLS scope" },
]);

function activeStopSelectorProblems(source) {
  const problems = [];
  const selectorCount = (source.match(/FROM mdata\.load_stops s/g) ?? []).length;
  const activePredicateCount = (source.match(/AND s\.soft_deleted_at IS NULL/g) ?? []).length;
  if (selectorCount !== 6) problems.push(`expected exactly 6 mounted load-stop selectors, found ${selectorCount}`);
  if (activePredicateCount !== selectorCount) {
    problems.push(`expected ${selectorCount} active-stop predicates, found ${activePredicateCount}`);
  }
  return problems;
}

for (const problem of activeStopSelectorProblems(routes)) fail(problem);

read("apps/backend/src/dispatch/driver-pwa/__tests__/dispatch-view.test.ts");

const indexTs = read("apps/backend/src/index.ts");

const screen = read("apps/driver-pwa/src/screens/DispatchView.tsx");
contains("apps/driver-pwa/src/screens/DispatchView.tsx", screen, [
  { pattern: /DispatchViewScreen/, label: "DispatchView screen export" },
  { pattern: /PickupCard/, label: "PickupCard render" },
  { pattern: /DeliveryCard/, label: "DeliveryCard render" },
  { pattern: /DocUploadDrawer/, label: "DocUploadDrawer render" },
]);

read("apps/driver-pwa/src/components/dispatch/PickupCard.tsx");
read("apps/driver-pwa/src/components/dispatch/DeliveryCard.tsx");
read("apps/driver-pwa/src/components/dispatch/DocUploadDrawer.tsx");
read("apps/driver-pwa/src/lib/dispatch-api-client.ts");
read("apps/driver-pwa/src/screens/__tests__/dispatch-view.test.ts");

const appTsx = read("apps/driver-pwa/src/App.tsx");
const loadDetail = read("apps/driver-pwa/src/pages/LoadDetail.tsx");

function mountProblems(indexSource, appSource, detailSource) {
  const problems = [];
  if (!/await registerDispatchViewRoutes\(app\);/.test(indexSource)) problems.push("backend route mount");
  if (!/path="\/dispatch\/:load_uuid"/.test(appSource)) problems.push("PWA route mount");
  if (!/DispatchViewScreen/.test(appSource)) problems.push("PWA screen mount");
  if (!/navigate\(`\/dispatch\/\$\{load\.id\}`\)/.test(detailSource)) problems.push("load-detail forward link");
  if (!/dispatch-actions-card/.test(detailSource)) problems.push("operator-visible dispatch action");
  return problems;
}

for (const problem of mountProblems(indexTs, appTsx, loadDetail)) fail(`connectivity missing ${problem}`);

if (SELFTEST) {
  const mutations = [
    ["backend mount", indexTs.replace(/await registerDispatchViewRoutes\(app\);/, ""), appTsx, loadDetail],
    ["PWA route", indexTs, appTsx.replace(/path="\/dispatch\/:load_uuid"/, 'path="/dispatch-disabled/:load_uuid"'), loadDetail],
    ["load-detail forward link", indexTs, appTsx, loadDetail.replace(/navigate\(`\/dispatch\/\$\{load\.id\}`\)/, "navigate(`/loads/${load.id}`)")],
  ];
  for (const [label, plantedIndex, plantedApp, plantedDetail] of mutations) {
    if (mountProblems(plantedIndex, plantedApp, plantedDetail).length === 0) {
      console.error(`verify:driver-pwa-dispatch-view SELFTEST FAILED — ${label} mutation was not caught`);
      process.exit(1);
    }
  }
  const activeStopMutations = [
    ["all active-stop predicates", routes.replace(/\s+AND s\.soft_deleted_at IS NULL/g, "")],
    ["one active-stop predicate", routes.replace(/\s+AND s\.soft_deleted_at IS NULL/, "")],
  ];
  for (const [label, plantedRoutes] of activeStopMutations) {
    if (activeStopSelectorProblems(plantedRoutes).length === 0) {
      console.error(`verify:driver-pwa-dispatch-view SELFTEST FAILED — ${label} mutation was not caught`);
      process.exit(1);
    }
  }
  console.log(
    `verify:driver-pwa-dispatch-view SELFTEST PASS — ${mutations.length + activeStopMutations.length} mount/link/lifecycle mutations caught`
  );
  process.exit(0);
}

const docs = read("docs/specs/gap-34-driver-pwa-dispatch.md");
contains("docs/specs/gap-34-driver-pwa-dispatch.md", docs, [
  { pattern: /GAP-34/, label: "GAP-34 identifier" },
  { pattern: /dispatch-view/, label: "dispatch-view route documented" },
]);

const manifest = read(".block-ready/GAP-34.json");
contains(".block-ready/GAP-34.json", manifest, [
  { pattern: /GAP-34/, label: "GAP-34 block id in manifest" },
  { pattern: /verify:driver-pwa-dispatch-view/, label: "verify gate in manifest" },
]);



if (failures.length > 0) {
  console.error("verify:driver-pwa-dispatch-view — FAILED");
  for (const entry of failures) {
    console.error(`  ✗ ${entry}`);
  }
  process.exit(1);
}

console.log("verify:driver-pwa-dispatch-view — OK");
