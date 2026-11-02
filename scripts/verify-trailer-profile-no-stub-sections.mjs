#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const files = [
  "apps/frontend/src/components/trailer-profile/StatusChangeModal.tsx",
  "apps/frontend/src/pages/fleet/TrailerProfilePage.tsx",
  "apps/frontend/src/components/trailer-profile/DocumentsSection.tsx",
  "apps/frontend/src/components/trailer-profile/MaintenanceSnapshotSection.tsx",
];

const forbidden = [
  "wired in follow-up",
  "Status change requires a reason (wired",
  "coming soon",
  "TODO: stub",
];

for (const rel of files) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) {
    console.error(`verify:trailer-profile-no-stub-sections FAIL: missing ${rel}`);
    process.exit(1);
  }
  const text = fs.readFileSync(full, "utf8");
  for (const phrase of forbidden) {
    if (text.toLowerCase().includes(phrase.toLowerCase())) {
      console.error(`verify:trailer-profile-no-stub-sections FAIL: stub phrase in ${rel}: ${phrase}`);
      process.exit(1);
    }
  }
}

const page = fs.readFileSync(path.join(ROOT, "apps/frontend/src/pages/fleet/TrailerProfilePage.tsx"), "utf8");
// fill-not-shell — need-company uses BoardSection
if (!page.includes('testId="trailer-profile-need-company"') || !page.includes("BoardSection")) {
  console.error(
    "verify:trailer-profile-no-stub-sections FAIL: need-company empty must be BoardSection (trailer-profile-need-company)",
  );
  process.exit(1);
}
if (!page.includes("putTrailerStatus") && !page.includes("StatusChangeModal")) {
  console.error("verify:trailer-profile-no-stub-sections FAIL: status modal not wired on page");
  process.exit(1);
}
if (!page.includes("EditTrailerModal")) {
  console.error("verify:trailer-profile-no-stub-sections FAIL: edit modal not wired on page");
  process.exit(1);
}
if (!page.includes("ServiceTimeline")) {
  console.error("verify:trailer-profile-no-stub-sections FAIL: activity section (ServiceTimeline) missing");
  process.exit(1);
}
// DUALPATH-07 fix (2026-07-22): TrailerRecentActivitySection is archived, not deleted (Rule 07) —
// it must no longer render on the live page alongside ServiceTimeline. See
// verify-fleet-profile-no-dual-activity.mjs.
if (/<TrailerRecentActivitySection[\s/>]/.test(page)) {
  console.error(
    "verify:trailer-profile-no-stub-sections FAIL: legacy TrailerRecentActivitySection must not " +
      "render live (DUALPATH-07 — archived, ServiceTimeline is canonical)"
  );
  process.exit(1);
}

console.log("verify:trailer-profile-no-stub-sections PASS");
