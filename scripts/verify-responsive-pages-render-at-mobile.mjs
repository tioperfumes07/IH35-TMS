#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();

const REQUIRED = [
  {
    file: "apps/frontend/src/pages/form425c/Form425CHome.tsx",
    markers: ["data-form425c-page", "Form425CHome"],
  },
  {
    file: "apps/frontend/src/components/layout/ModuleHeader.tsx",
    markers: ["ih35-module-header-actions", "responsive-breakpoints.css"],
  },
  {
    file: "apps/frontend/src/components/Sidebar.tsx",
    markers: ["mobileOpen", "md:hidden"],
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
  console.error("[verify-responsive-pages-render-at-mobile] FAIL:");
  for (const message of failures) console.error(`  - ${message}`);
  process.exit(1);
}

console.log("[verify-responsive-pages-render-at-mobile] OK");
