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
if (!page.includes("putTrailerStatus") && !page.includes("StatusChangeModal")) {
  console.error("verify:trailer-profile-no-stub-sections FAIL: status modal not wired on page");
  process.exit(1);
}
if (!page.includes("EditTrailerModal")) {
  console.error("verify:trailer-profile-no-stub-sections FAIL: edit modal not wired on page");
  process.exit(1);
}
if (!page.includes("TrailerRecentActivitySection")) {
  console.error("verify:trailer-profile-no-stub-sections FAIL: activity section missing");
  process.exit(1);
}

console.log("verify:trailer-profile-no-stub-sections PASS");
