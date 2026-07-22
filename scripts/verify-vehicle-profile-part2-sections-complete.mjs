#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const page = fs.readFileSync(path.join(ROOT, "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx"), "utf8");
const required = [
  "vp-section-7-reefer",
  "vp-section-8-financial",
  "vp-section-10-documents",
  "vp-section-11-action-bar",
];
for (const id of required) {
  if (!page.includes(id)) {
    console.error(`verify:vehicle-profile-part2-sections-complete FAIL: missing ${id}`);
    process.exit(1);
  }
}
// DUALPATH-06 fix (2026-07-22): vp-section-9-activity hosted the deprecated raw-JSON
// RecentActivitySection widget alongside ServiceTimeline — removed from the live render path
// (see verify-fleet-profile-no-dual-activity.mjs). Do not re-add it here.
if (page.includes('data-testid="vp-section-9-activity"')) {
  console.error(
    "verify:vehicle-profile-part2-sections-complete FAIL: vp-section-9-activity must not return " +
      "(DUALPATH-06 — RecentActivitySection is archived, ServiceTimeline is canonical)"
  );
  process.exit(1);
}
console.log("verify:vehicle-profile-part2-sections-complete PASS");
