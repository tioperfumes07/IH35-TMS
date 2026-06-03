#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const targetFile = path.join(repoRoot, "apps/frontend/src/components/FleetTable.tsx");
const source = fs.readFileSync(targetFile, "utf8");

if (!source.includes('type="checkbox"')) {
  console.error("[verify-fleet-bulk-select-checkbox-column] Missing checkbox input in FleetTable.tsx");
  process.exit(1);
}

if (!/<th[\s\S]*type="checkbox"/m.test(source) && !/<th[\s\S]*aria-label="Select all units/m.test(source)) {
  console.error("[verify-fleet-bulk-select-checkbox-column] Missing header checkbox column in FleetTable.tsx");
  process.exit(1);
}

console.log("[verify-fleet-bulk-select-checkbox-column] OK");
