#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const docPath = path.join(repoRoot, "docs/specs/KPI_SOURCES_OF_TRUTH.md");
const required = [
  "Active Loads",
  "In Transit",
  "Active GPS Positions",
  "Driver Escrow",
  "Active Drivers",
  "Open Work Orders",
  "PM Due",
  "Past Due Bills",
  "Open Receivables",
];

if (!fs.existsSync(docPath)) {
  console.error("[verify-kpi-sources-of-truth-exists] Missing docs/specs/KPI_SOURCES_OF_TRUTH.md");
  process.exit(1);
}

const text = fs.readFileSync(docPath, "utf8");
const missing = required.filter((name) => !text.includes(name));
if (missing.length > 0) {
  console.error(`[verify-kpi-sources-of-truth-exists] Doc missing KPI sections: ${missing.join(", ")}`);
  process.exit(1);
}

console.log("[verify-kpi-sources-of-truth-exists] OK");
