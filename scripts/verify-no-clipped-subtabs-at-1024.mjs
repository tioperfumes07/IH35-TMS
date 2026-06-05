#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();

const REQUIRED = [
  {
    file: "apps/frontend/src/components/layout/TopStatusBar.tsx",
    markers: ["compactMaxWidth = 1366", "StatusBarMobile", "data-status-bar-desktop"],
  },
  {
    file: "apps/frontend/src/components/layout/SubTabRow.tsx",
    markers: ["data-subtab-row", "data-subtab-scroll-chevron", "overflow-x-auto"],
  },
  {
    file: "apps/frontend/src/pages/maintenance/MaintenanceHome.tsx",
    markers: ["SubTabRow", "data-maintenance-subtab", "parts_inventory"],
  },
  {
    file: "apps/frontend/src/components/Topbar.tsx",
    markers: ["TopStatusBar"],
  },
];

const failures = [];

for (const req of REQUIRED) {
  const full = path.join(repoRoot, req.file);
  if (!fs.existsSync(full)) {
    failures.push(`${req.file} (missing)`);
    continue;
  }
  const source = fs.readFileSync(full, "utf8");
  for (const marker of req.markers) {
    if (!source.includes(marker)) {
      failures.push(`${req.file} (missing marker: ${marker})`);
    }
  }
}

if (failures.length > 0) {
  console.error("[verify-no-clipped-subtabs-at-1024] FAIL:");
  for (const message of failures) console.error(`  - ${message}`);
  process.exit(1);
}

console.log("[verify-no-clipped-subtabs-at-1024] OK — SubTabRow scroll + status bar compact <=1366px");
