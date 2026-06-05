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

const MARKERS = {
  "apps/frontend/src/styles/responsive-breakpoints.css": ["max-width: 1023px", "max-width: 767px"],
  "apps/frontend/src/components/Topbar.tsx": ["max-md:grid-cols-1", "top-bar"],
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
