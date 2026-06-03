#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const targetFile = path.join(repoRoot, "apps/frontend/src/components/FleetTable.tsx");
const source = fs.readFileSync(targetFile, "utf8");

if (!source.includes("BulkActionBar")) {
  console.error("[verify-bulk-action-bar-mounted] BulkActionBar not referenced in FleetTable.tsx");
  process.exit(1);
}

if (!source.includes('from "./fleet/BulkActionBar"') && !source.includes("from './fleet/BulkActionBar'")) {
  console.error("[verify-bulk-action-bar-mounted] Missing BulkActionBar import in FleetTable.tsx");
  process.exit(1);
}

if (!source.includes("<BulkActionBar")) {
  console.error("[verify-bulk-action-bar-mounted] BulkActionBar component not mounted in FleetTable.tsx");
  process.exit(1);
}

console.log("[verify-bulk-action-bar-mounted] OK");
