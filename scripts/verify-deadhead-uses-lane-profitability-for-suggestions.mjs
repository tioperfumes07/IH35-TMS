#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const service = fs.readFileSync(path.join(ROOT, "apps/backend/src/reports/deadhead.service.ts"), "utf8");

if (!service.includes("reports.lane_profitability_cache")) {
  console.error("verify:deadhead-uses-lane-profitability-for-suggestions FAIL: must query lane_profitability_cache");
  process.exit(1);
}
if (!service.includes("getBackhaulSuggestions")) {
  console.error("verify:deadhead-uses-lane-profitability-for-suggestions FAIL: getBackhaulSuggestions missing");
  process.exit(1);
}

console.log("verify:deadhead-uses-lane-profitability-for-suggestions PASS");
