#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const targetFile = path.join(repoRoot, "apps/frontend/src/components/home/DriverDaySummaryCard.tsx");
const source = fs.readFileSync(targetFile, "utf8");

const emptyStateMarker = "query.data?.has_data === false";
if (!source.includes(emptyStateMarker)) {
  console.error("[verify-driver-day-summary-empty-state-not-red] missing has_data===false empty-state branch");
  process.exit(1);
}

const emptyStateStart = source.indexOf(emptyStateMarker);
const emptyStateBranch = source.slice(emptyStateStart, emptyStateStart + 500);
if (/text-red|error/i.test(emptyStateBranch)) {
  console.error("[verify-driver-day-summary-empty-state-not-red] empty-state branch must not use red/error styling");
  process.exit(1);
}

if (!source.includes("Couldn't load summary right now.")) {
  console.error("[verify-driver-day-summary-empty-state-not-red] missing network error copy");
  process.exit(1);
}

console.log("[verify-driver-day-summary-empty-state-not-red] OK");
