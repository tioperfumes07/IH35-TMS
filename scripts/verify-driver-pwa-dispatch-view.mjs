#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
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

const pkg = read("package.json");
contains("package.json", pkg, [
  { pattern: /verify:driver-pwa-dispatch-view/, label: "npm script for verify gate" },
]);

const ci = read(".github/workflows/ci.yml");
contains(".github/workflows/ci.yml", ci, [
  { pattern: /verify:driver-pwa-dispatch-view/, label: "CI workflow runs verify gate" },
]);

if (failures.length > 0) {
  console.error("verify:driver-pwa-dispatch-view — FAILED");
  for (const entry of failures) {
    console.error(`  ✗ ${entry}`);
  }
  process.exit(1);
}

console.log("verify:driver-pwa-dispatch-view — OK");
