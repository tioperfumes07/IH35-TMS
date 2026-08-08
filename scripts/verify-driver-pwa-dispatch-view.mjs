#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
// Rule 17 (no-guard-hotfile-thrash): a guard must NOT require a package.json / ci.yml edit —
// those are the shared hot files every lane contends on, and Rule 17 forbids a new guard from touching
// them. What actually makes a guard run in CI is a verify-step, so check for that and report its
// absence as a NOTE, never as a failure.
const wiredStep__driver_pwa_dispatch_view = fs
  .readdirSync(path.join(ROOT, "scripts/verify-steps"))
  .some((f) => /^\d+-verify-driver-pwa-dispatch-view\.mjs$/.test(f));
if (!wiredStep__driver_pwa_dispatch_view) {
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

read("apps/backend/src/dispatch/driver-pwa/__tests__/dispatch-view.test.ts");

const indexTs = read("apps/backend/src/index.ts");
contains("apps/backend/src/index.ts", indexTs, [
  { pattern: /registerDispatchViewRoutes/, label: "dispatch-view routes registered in index" },
]);

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
contains("apps/driver-pwa/src/App.tsx", appTsx, [
  { pattern: /path="\/dispatch\/:load_uuid"/, label: "PWA /dispatch/:load_uuid route" },
  { pattern: /DispatchViewScreen/, label: "DispatchView screen wired" },
]);

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
