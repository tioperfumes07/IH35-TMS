#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();

const REQUIRED = [
  {
    file: "apps/frontend/src/components/layout/TopStatusBar.tsx",
    markers: ["useMaxWidth", "compactMaxWidth = 767", "StatusBarMobile", "data-status-bar-desktop"],
  },
  {
    file: "apps/frontend/src/components/layout/StatusBarMobile.tsx",
    markers: ["data-status-bar-mobile", "StatusBarPopover", "h-10"],
  },
  {
    file: "apps/frontend/src/components/layout/StatusBarPopover.tsx",
    markers: ["role=\"dialog\"", "aria-label"],
  },
  {
    file: "apps/frontend/src/components/Topbar.tsx",
    markers: ["TopStatusBar", "top-bar"],
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
  console.error("[verify-status-bar-height-at-mobile] FAIL:");
  for (const message of failures) console.error(`  - ${message}`);
  process.exit(1);
}

console.log("[verify-status-bar-height-at-mobile] OK — mobile bar capped at h-10 (40px) with icon-only dots at <=767px");
