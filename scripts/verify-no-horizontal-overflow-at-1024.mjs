#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();

const REQUIRED = [
  "apps/frontend/src/styles/responsive-breakpoints.css",
  "apps/frontend/src/components/Topbar.tsx",
  "apps/frontend/src/components/Sidebar.tsx",
];

// TOPBAR-01 (2026-07-29): these markers previously demanded "max-md:grid-cols-1" and
// "max-width: 767px". Both PINNED THE DEFECT this guard is named for. `max-md` stacks only below
// 768px, so at 1024px — the exact width in this guard's title — the top bar stayed in three columns
// and its tracks overflowed into each other. Verified live on prod: the company switcher sat at
// x:410 y:51 w:164 h:26 and document.elementFromPoint() at its centre returned an <svg>; the button
// was physically unclickable and entities could not be switched at all. The guard was asserting the
// broken value. Markers now require a stack breakpoint that actually covers 1024px.
const MARKERS = {
  "apps/frontend/src/styles/responsive-breakpoints.css": ["max-width: 1023px", "max-width: 1279px"],
  "apps/frontend/src/components/Topbar.tsx": ["max-xl:grid-cols-1", "top-bar", "minmax(0,"],
  "apps/frontend/src/components/Sidebar.tsx": ["max-lg:overflow-x-hidden", "sidebar"],
};

const failures = [];

for (const rel of REQUIRED) {
  const full = path.join(repoRoot, rel);
  if (!fs.existsSync(full)) {
    failures.push(`${rel} (missing)`);
    continue;
  }
  const source = fs.readFileSync(full, "utf8");
  for (const marker of MARKERS[rel] ?? []) {
    if (!source.includes(marker)) {
      failures.push(`${rel} (missing marker: ${marker})`);
    }
  }
}

if (failures.length > 0) {
  console.error("[verify-no-horizontal-overflow-at-1024] FAIL:");
  for (const message of failures) console.error(`  - ${message}`);
  process.exit(1);
}

console.log("[verify-no-horizontal-overflow-at-1024] OK");
