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

const service = read("apps/backend/src/maintenance/severe-repair-estimate.service.ts");
contains("apps/backend/src/maintenance/severe-repair-estimate.service.ts", service, [
  { pattern: /getFleetRestoreCost/, label: "getFleetRestoreCost export" },
  { pattern: /getPerUnitBreakdown/, label: "getPerUnitBreakdown export" },
  { pattern: /total_remaining_cents/, label: "remaining cost field" },
]);

const routes = read("apps/backend/src/maintenance/severe-repair-estimate.routes.ts");
contains("apps/backend/src/maintenance/severe-repair-estimate.routes.ts", routes, [
  { pattern: /\/api\/v1\/maintenance\/severe-repair\/fleet-restore-cost/, label: "fleet-restore-cost route" },
  { pattern: /\/api\/v1\/maintenance\/severe-repair\/per-unit-breakdown/, label: "per-unit-breakdown route" },
  { pattern: /\/api\/v1\/maintenance\/severe-repair\/export-pdf/, label: "export-pdf route" },
  { pattern: /forbidden_owner_only/, label: "Owner-only RBAC on PDF export" },
]);

read("apps/backend/src/maintenance/severe-repair-pdf-export.ts");
read("apps/backend/src/maintenance/__tests__/severe-repair-estimate-gap7.test.ts");

const homeCard = read("apps/frontend/src/pages/home/HomeFleetRestoreCard.tsx");
contains("apps/frontend/src/pages/home/HomeFleetRestoreCard.tsx", homeCard, [
  { pattern: /HomeFleetRestoreCard/, label: "home card component" },
  { pattern: /getFleetRestoreCost/, label: "fleet restore API wired" },
  { pattern: /home-fleet-restore-card/, label: "test id for card" },
]);

const ownerHome = read("apps/frontend/src/pages/home/OwnerHome.tsx");
contains("apps/frontend/src/pages/home/OwnerHome.tsx", ownerHome, [
  { pattern: /HomeFleetRestoreCard/, label: "card mounted on Owner home" },
]);

const docs = read("docs/specs/gap-7-severe-repair-oos-estimate.md");
contains("docs/specs/gap-7-severe-repair-oos-estimate.md", docs, [
  { pattern: /GAP-7/, label: "GAP-7 identifier" },
  { pattern: /fleet-restore-cost/, label: "routes documented" },
]);

const manifest = read(".block-ready.json");
contains(".block-ready.json", manifest, [
  { pattern: /GAP-7/, label: "GAP-7 block id in manifest" },
]);

if (failures.length > 0) {
  console.error("verify:severe-repair-estimate — FAILED");
  for (const entry of failures) {
    console.error(`  ✗ ${entry}`);
  }
  process.exit(1);
}

console.log("verify:severe-repair-estimate — OK");
