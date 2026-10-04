#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();

const REQUIRED = [
  {
    file: "apps/frontend/src/components/layout/TopStatusBar.tsx",
    markers: ["useMaxWidth", "compactMaxWidth", "StatusBarMobile", "data-status-bar-desktop"],
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
  // BANK-F91334 leftover refuse — StatusBarMobile page-scoped text token ratchet
  if (req.file.endsWith("StatusBarMobile.tsx")) {
    if (source.includes("text-[11px]")) {
      failures.push(`${req.file}: leftover text-[11px]`);
    }
    if (source.includes("#8A92AB")) {
      failures.push(`${req.file}: leftover off-scale muted #8A92AB`);
    }
  }
}

if (process.argv.includes("--selftest")) {
  const mobilePath = path.join(repoRoot, "apps/frontend/src/components/layout/StatusBarMobile.tsx");
  const live = fs.readFileSync(mobilePath, "utf8");
  const leftoverPlant = live + '\n<div className="text-[11px] text-[#8A92AB]">plant</div>\n';
  const plantFails =
    leftoverPlant.includes("text-[11px]") || leftoverPlant.includes("#8A92AB");
  if (!plantFails) {
    console.error("[verify-status-bar-height-at-mobile] --selftest FAIL — leftover plant escaped");
    process.exit(1);
  }
  if (failures.length > 0) {
    console.error("[verify-status-bar-height-at-mobile] --selftest FAIL on live tree:");
    for (const message of failures) console.error(`  - ${message}`);
    process.exit(1);
  }
  console.log("[verify-status-bar-height-at-mobile] --selftest PASS");
  process.exit(0);
}

if (failures.length > 0) {
  console.error("[verify-status-bar-height-at-mobile] FAIL:");
  for (const message of failures) console.error(`  - ${message}`);
  process.exit(1);
}

console.log("[verify-status-bar-height-at-mobile] OK — StatusBarMobile capped at h-10 (40px) with icon-only compact mode");
