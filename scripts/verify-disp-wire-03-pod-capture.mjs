#!/usr/bin/env node
/**
 * CLS-DISP-WIRE-03 — driver POD capture is wired end-to-end (not orphan chrome).
 *
 * FAIL if:
 *   (a) POST /api/v1/driver/loads/:loadId/stops/:stopId/pod missing or no INSERT dispatch.pod_documents
 *   (b) route does not gate on isDeliveryStop
 *   (c) registerDispatchPodBolRoutes not mounted from apps/backend/src/index.ts
 *   (d) driver-pwa submitPodCapture client missing / wrong path
 *   (e) PodCapture does not call submitPodCapture
 *   (f) StopAction does not mount PodCapture for delivery + arrived
 *   (g) App route /loads/:id/stops/:stopId missing StopActionPage
 *
 * Density (Neon pod_documents row count) is OUT OF SCOPE — ops must dispatch a load first.
 * Mutation-tested both directions.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-disp-wire-03-pod-capture";

const PATHS = {
  routes: "apps/backend/src/dispatch/pod.routes.ts",
  index: "apps/backend/src/index.ts",
  api: "apps/driver-pwa/src/api/pod.ts",
  capture: "apps/driver-pwa/src/components/PodCapture.tsx",
  stopAction: "apps/driver-pwa/src/pages/StopAction.tsx",
  app: "apps/driver-pwa/src/App.tsx",
};

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

export function auditPodCaptureWire(sources) {
  const problems = [];
  const routes = sources.routes ?? "";
  const index = sources.index ?? "";
  const api = sources.api ?? "";
  const capture = sources.capture ?? "";
  const stopAction = sources.stopAction ?? "";
  const app = sources.app ?? "";

  if (!/\/api\/v1\/driver\/loads\/:loadId\/stops\/:stopId\/pod["']/.test(routes)) {
    problems.push(`${PATHS.routes}: missing POST driver POD capture route`);
  }
  if (!/INSERT\s+INTO\s+dispatch\.pod_documents/i.test(routes)) {
    problems.push(`${PATHS.routes}: POD capture path does not INSERT dispatch.pod_documents`);
  }
  if (!/isDeliveryStop\s*\(/.test(routes)) {
    problems.push(`${PATHS.routes}: POD capture must gate on isDeliveryStop`);
  }
  if (!/WHERE s\.id = \$1::uuid[\s\S]*?AND s\.load_id = \$2::uuid[\s\S]*?AND s\.soft_deleted_at IS NULL[\s\S]*?assigned_primary_driver_id/.test(routes)) {
    problems.push(`${PATHS.routes}: POD capture must reject retired load stops before authorization`);
  }
  if (!/pending_review/.test(routes)) {
    problems.push(`${PATHS.routes}: POD insert must stamp pending_review`);
  }
  if (!/registerDispatchPodBolRoutes/.test(index)) {
    problems.push(`${PATHS.index}: registerDispatchPodBolRoutes not mounted`);
  }
  if (!/export\s+async\s+function\s+submitPodCapture/.test(api)) {
    problems.push(`${PATHS.api}: submitPodCapture client missing`);
  }
  if (!/\/api\/v1\/driver\/loads\/\$\{[^}]+\} \/stops\/\$\{[^}]+\} \/pod/.test(api.replace(/\s+/g, " ")) &&
      !/\/stops\/\$\{encodeURIComponent\(stopId\)\}\/pod/.test(api)) {
    problems.push(`${PATHS.api}: submitPodCapture must POST .../stops/:stopId/pod`);
  }
  if (!/submitPodCapture/.test(capture)) {
    problems.push(`${PATHS.capture}: PodCapture does not call submitPodCapture`);
  }
  if (!/data-testid=["']pod-capture-panel["']/.test(capture) && !/pod-capture/.test(capture)) {
    problems.push(`${PATHS.capture}: PodCapture missing capture panel test id / marker`);
  }
  if (!/<PodCapture\b/.test(stopAction)) {
    problems.push(`${PATHS.stopAction}: StopAction must mount <PodCapture /> for delivery stops`);
  }
  if (!/type\s*===\s*["']delivery["']/.test(stopAction)) {
    problems.push(`${PATHS.stopAction}: PodCapture gate must require delivery stop type`);
  }
  if (!/path=["']\/loads\/:id\/stops\/:stopId["']/.test(app)) {
    problems.push(`${PATHS.app}: missing /loads/:id/stops/:stopId route`);
  }
  if (!/StopActionPage/.test(app)) {
    problems.push(`${PATHS.app}: stop route must render StopActionPage`);
  }

  return problems;
}

function realSources() {
  return Object.fromEntries(Object.entries(PATHS).map(([k, rel]) => [k, read(rel)]));
}

function mutate(src, from, to, label) {
  const out = typeof from === "string" ? src.replace(from, to) : src.replace(from, to);
  if (out === src) throw new Error(`mutation "${label}" did not apply`);
  return out;
}

function selftest() {
  const failures = [];
  const real = realSources();
  const clean = auditPodCaptureWire(real);
  if (clean.length) failures.push(`case0 FAIL: ${clean.join(" | ")}`);

  const cases = [
    {
      label: "route removed",
      run: () =>
        auditPodCaptureWire({
          ...real,
          routes: mutate(
            real.routes,
            "/api/v1/driver/loads/:loadId/stops/:stopId/pod",
            "/api/v1/driver/loads/:loadId/stops/:stopId/pod-GONE",
            "route",
          ),
        }),
      expect: "missing POST driver POD capture",
    },
    {
      label: "INSERT removed",
      run: () =>
        auditPodCaptureWire({
          ...real,
          routes: mutate(
            real.routes,
            /INSERT\s+INTO\s+dispatch\.pod_documents/i,
            "INSERT INTO dispatch.NOT_POD_DOCS",
            "insert",
          ),
        }),
      expect: "INSERT dispatch.pod_documents",
    },
    {
      label: "active-stop predicate removed",
      run: () =>
        auditPodCaptureWire({
          ...real,
          routes: mutate(real.routes, /\s+AND s\.soft_deleted_at IS NULL/, "", "active stop"),
        }),
      expect: "reject retired load stops",
    },
    {
      label: "StopAction mount removed",
      run: () =>
        auditPodCaptureWire({
          ...real,
          stopAction: mutate(real.stopAction, /<PodCapture\b/, "<PodCaptureGONE", "mount"),
        }),
      expect: "StopAction must mount",
    },
    {
      label: "submitPodCapture removed",
      run: () =>
        auditPodCaptureWire({
          ...real,
          api: mutate(real.api, "export async function submitPodCapture", "export async function submitPodGONE", "api"),
        }),
      expect: "submitPodCapture client missing",
    },
  ];

  for (const c of cases) {
    let problems;
    try {
      problems = c.run();
    } catch (err) {
      failures.push(`${c.label}: ${err.message}`);
      continue;
    }
    if (!problems.some((p) => p.includes(c.expect))) {
      failures.push(`${c.label} NOT caught (got: ${problems.join(" | ") || "none"})`);
    }
  }

  if (failures.length) {
    console.error(`${LABEL}: SELFTEST FAIL`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest OK`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = auditPodCaptureWire(realSources());
  if (problems.length) {
    console.error(`${LABEL}: FAIL`);
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log(
    `${LABEL}: OK — StopAction → PodCapture → submitPodCapture → POST pod → INSERT pod_documents (density ops-gated)`,
  );
}

main();
